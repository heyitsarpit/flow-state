# Composition with traits and subroutines

Status: revised proposal, round 2, 2026-10-28. Nothing here is implemented or accepted. Only this
proposal is changed; the capability Plans remain authoritative for shipped work.

## 1. Recommendation and assumptions

Use **`trait()` for behaviour present throughout its containing scope**, and **`subroutine()`
for a step explicitly called with arguments and left by return or abandonment**. Both compile
into one actor: one mailbox, one active leaf, one atomic publication. A trait in a subroutine
lives for that invocation. “Trait” means a stateful Scala-style mixin here, not a TS interface.

The distinction is lifetime and control flow, not whether an implementation needs states.
A stateless confirmation is still a subroutine. Traits cannot declare states, start work or
return. A subroutine cannot be embedded as a trait. Orthogonal stateful processes still need
separate actors. There are no parallel regions, child actors or independently running fragments.

| Assumption / prior decision | Verdict | Reason |
| --- | --- | --- |
| D12–D13: two constructors | Keep | A constructor tells an author the lifetime and control-flow rules before placement; the cost is two descriptor types whose own nodes have different bounds under one callback-target rule. |
| Definition/machine split, structure as data, deterministic Runtime clock | Keep | Definitions derive complete initial snapshot shapes without machine bindings; behaviour supplies operations and policy later. |
| D1–D3 nesting and readable names | Keep with limits | Public paths are compatibility commitments; private behaviour remains inaccessible, and the existing ten-segment state-path bound still applies. |
| D4/D6 declared dependencies, D7 explicit returns, D8 matching placement names | Keep | Inputs, policy, requests and returns have named owners; bindings live at the placement path. |
| D5 only exits end a step | Narrow | Only exits return; an ordinary owner transition may abandon a step without its permission. |
| D9 implementation privacy / D10 declared policy | Keep | Nobody rewrites a child's handlers or memory; policy enters only at guard props the child declares. |
| D11 universal host forwarding | Drop | The fragment declares public events versus placer-only commands; invariant-carrying public inputs require no intermediary forwarding. |
| TS-only prop shapes | Change | Schema owns data contracts, including fixed input and live values; guards/selectors remain TS functions. |
| First send duplicated in host and retry | Drop | An explicit call appends the subroutine's start transition to the accepted turn; initialization and restore do not start effects. |

Correctness, glanceable reading and then brevity remain the priorities. Direct reads remove the
need for mirrors, but cannot forbid arbitrary copies. Actor-lifetime timers are not automatically
appropriate for every host state. No API can prove remote idempotence or the business meaning of
an adapter's error tag.

## 2. API and vocabulary

```ts
// Signature notation, not implementation declarations.
trait(contract, build);
subroutine(contract, build);

// Fixed seed: definition-side input, not a machine-bound prop.
embeds: { title: { trait: RequiredField, input: () => ({ value: "" }) } };

// Live values, policy, notifications and finite requests.
prop(Schema.String);
prop.optional(Schema.Int);
guard();
callback({ value: Schema.String });
callback.optional({ value: Schema.String });
request({
  kind: "commit",
  input: { request: RenameRequest },
  answers: {
    success: { Succeeded: { receipt: RenameReceipt } },
    failure: { Busy: {}, Rejected: { reason: Schema.String } },
  },
});

// Subroutine arguments belong on the call edge.
target: S.SAVE.call.from(({ payload }) => ({ request: payload.request }));
target: S.LIVE.call();

// Start belongs to behaviour: a static initial target and optional request actions.
start: { target: S.SENDING, actions: [props.onSend.from(({ memory }) => ({ request: memory.request }))] };

// Host binding: reply producers exist only in this construction-time callback.
onSend: ({ O, reply }) => ({
  actions: [O.save.commit(({ payload }) => payload.request, {
    outcomes: {
      success: reply.Succeeded.from((receipt) => ({ receipt })),
      failure: { Busy: reply.Busy, Rejected: reply.Rejected.from((e) => ({ reason: e.reason })) },
    },
  })],
  abandoned: abandonedSave,
});
```

### One place for each decision

| Question | Location |
| --- | --- |
| What is this piece's lifetime? | Its constructor: trait or subroutine. |
| Who may send an input? | The fragment contract: `events`, `hostEvents`, `internalEvents`. |
| What is fixed at initialization? | `input` and definition-side trait seed / explicit subroutine call. |
| What may change while active? | `props`: live values and declared guards. |
| What starts on a call? | The subroutine's unguarded `start` transition. |
| What does an operation mean? | Fragment reply handlers; the host adapts success and its actual error tags. |
| What happens after an abandoned write? | One required `abandoned` observer beside that operation binding. |

Every subroutine target is `S.NAME.call()` or `.call.from(mapper)`; bare subroutine targets and
subroutine defaults reject. Existing ordinary compound defaults stay unchanged. Stateful
subroutines instead have one `start` transition to a direct child, which may itself be a call.
A stateless subroutine with no startup work omits start: self/no actions is implied. Missing
events, hostEvents, internalEvents and exits mean empty records. No READY/OPENING state or Begin
event exists. These omissions do not derive a kind; the constructor already fixes it.

**A call mapper reads its event/exit payload or pre-turn memory, never the source transition's
pending patch.** To set and pass a new ticket id in one transition, derive both from `event.id`;
do not set `memory.ticketId` and expect the call mapper to see that patch. Inside a newly called
scope, start reads that scope's initialized entry memory; surviving scopes still use the original
pre-turn snapshot. Original input is unavailable after initialization; start uses memory.

Start is part of an explicit accepted call, not an entry action: restore, hydration, render,
adoption and ordinary state re-entry do not execute it. Its target is static and unguarded;
its actions may issue request props only. It cannot notify, raise, return or choose a target
with a closure. A nested call's start continues the same accepted call chain.

### Vocabulary ledger and counts

All framework additions are listed here. JS/TS/JSX and Effect/React APIs are dependencies. Other
local variables, data fields, ids, state/event names and semantic answers are author-chosen,
including Edit, SetDraft, Replace, Succeeded, Refused, Returned, SAVE, original and unresolved.
The six abandoned-outcome tags below are framework data cases, not author-chosen names.

| Classification | Spellings |
| --- | --- |
| Existing in Plans | definition, machine, resource, transaction, deny, check, Attempt, Actor; id, states, events, internalEvents, memory, input, initial, operations, default, on, target, guard field, updateMemory, actions, schedules, schedule, send, restartOn, activities, outcomes, success, failure, unknown, interrupt, defect, commit, refetch, subscribe, cancel, retry, writes, optimistic, key, result, lookup, concurrency, staleTime, gcTime; S, E, O, .from, .is, state, context, now, event; useView, useActor; story.machine, services, fixtures, .send, .process, .advance, .checkpoint, .run, checkpoints, snapshot, end, pending, trace. |
| New constructors: 6 | `trait`, `subroutine`, `prop`, `callback`, `guard()` prop constructor, `request`. |
| New composition members: 15 | `embeds`, `props`, `hostEvents`, `exits`, `raise`, `start`, `.call`, `.optional`, `payload`, `answers`, `replies`, `reply`, `kind`, `abandoned`, `outcome`. |
| New request-kind values: 2 | `"commit"`, `"read"`. Their spellings already occur elsewhere in the Plans; these are new discriminator roles. |
| New diagnostic code: 1 | `RaisedCommandUnhandled`; counted explicitly rather than left unledgered. |
| New testing roles: 7 | `story.fragment`, `.call(input)`, `.leave()`, captured `.fragment`, `.result`, `.calls`, `.abandoned`. All belong to flow-state/testing. |
| New abandoned fact cases: 6 | `Pending`, `Success`, `Failure`, `Unknown`, `Interrupt`, `Defect`; full union in §4.5. `_tag`, value and error are ordinary tagged-data conventions, with the precise envelope defined there. |
| Existing spellings extended | input/initial seed both kinds; trait/input are placement-record keys; .from also maps calls/notifications/requests/returns; events is public everywhere and may be omitted for no local events; request kinds supply standard unknown/interrupt/defect replies; attempt is available to the abandoned observer; schedule callbacks may read live props. |
| Dependency APIs | Effect 4.0.5 Schema.Struct, String, Int, Boolean, NullOr and .Type; Effect.gen, sleep, fail; JSX and React event handlers. |

**Count: 37 framework entries: 31 API-role entries = 6 + 15 + 2 + 1 + 7, plus 6 tagged fact cases.** This counts route
roles, so .call as an authoring target and .call(input) as a Story command count separately;
it is not a claim of 31 distinct English words. The round 2 audit's ~36 was approximate. Removed
test requests/operation/select and the abandoned pending-member role; added answers/outcome and
made all cases explicit. The rules now have **16 numbered groups in §4**; grouped clauses are
still obligations, not a claim that ~60 old obligations disappeared. These denominators make
the counts reproducible instead of presenting grouping as a feature reduction. Under the audit's
approximate semantic-clause method, about **55 normative obligations** remain (roughly ±2),
organized into those 16 groups. The single observer introduces six explicit data cases; this
is not disguised as a six-word reduction. The reduction is in duplicate binding forms, routing
branches and repeated rule statements; all requested features remain.

`answers` declares semantic data shapes; `replies` handles received data; lexical `reply`
contains restricted producers. There is one production/Story binding form. Removed exposes,
fragmentStory, generated start events, test requests/operation/select and per-outcome abandoned
blocks have no aliases. Optional declarations use only .optional; guards remain required.

### Required and optional props

| Declaration | Binding and absence |
| --- | --- |
| `prop(schema)` | Required live selector; absent is a type/construction error. |
| `prop.optional(schema)` | Unbound reads undefined; bound values validate against Schema. |
| `guard()` | Required pure `true | deny(...)`; there is no implicit permission grant. |
| `callback(fields)` | Required notification handler; an empty handler is an explicit recorded no-op. |
| `callback.optional(fields)` | May be omitted; unbound calls do nothing and are recorded, and `flow check` lists the omission before execution. |
| `request(...)` | Required operation/delegation binding; no optional request, veto, empty action or silent no-op. |
| An exit | Every placement maps it; no ignore, guard or `"self"` return mapping. |

`initial` never receives props. Definition-side trait input mappers receive the owner's admitted
input and initialized **own** memory, excluding child slices, context, activities, props and
machine bindings. Seeds are computed parent before child while constructing the initial snapshot.
Types expose only this narrow seed context; construction validates the returned input shape.
This makes the definition's initial memory independent of a machine. Live prop selectors cannot
retroactively reseed a trait. Optional values remain useful for live configuration, not initial data.

## 3. Complete examples

These modules are full proposed code. Common declarations are written once in `pieces.ts`.
Each of the six examples has a host definition, host machine and sending/reading component.
Components receive the existing actor handle under a normal FlowProvider. Demo adapters use the
Runtime-controlled Effect clock and no network; they are not a production persistence example.

### 3.1 Contracts, operations and reusable pieces

```ts
// pieces.ts
import { Schema, Effect } from "effect";
import {
  trait, subroutine, prop, callback, guard, request, deny,
  resource, transaction, Attempt,
} from "flow-state";

export const RenameRequest = Schema.Struct({
  ticketId: Schema.String,
  title: Schema.String,
  revision: Schema.Int,
});

export const RenameReceipt = Schema.Struct({
  ticketId: Schema.String,
  title: Schema.String,
});

export const Address = Schema.Struct({ street: Schema.String, city: Schema.String });

export type SaveError = { _tag: "Busy" } | { _tag: "Rejected"; reason: string };

const busy = (): SaveError => ({ _tag: "Busy" });

const rejected = (): SaveError => ({ _tag: "Rejected", reason: "Title refused" });

export const SaveTitle = transaction({
  id: "Demo/SaveTitle",
  key: (p: typeof RenameRequest.Type) => ({ ticketId: p.ticketId }),
  input: RenameRequest,
  concurrency: "serialize",
  commit: (p: typeof RenameRequest.Type) => Effect.gen(function* () {
    yield* Effect.sleep("20 millis");
    if (p.title === "busy") return yield* Effect.fail(busy());
    if (p.title === "reject") return yield* Effect.fail(rejected());
    return { ticketId: p.ticketId, title: p.title.trim().toUpperCase() };
  }),
});

export const QueueValue = Schema.Struct({ label: Schema.String });

export const ReadQueue = resource({
  id: "Demo/ReadQueue",
  key: () => ({}),
  result: QueueValue,
  staleTime: "1 second",
  gcTime: "1 minute",
  lookup: () => Effect.gen(function* () {
    yield* Effect.sleep("20 millis");
    return { label: "Queue ready" };
  }),
});

export const Debounce = trait(
  {
    id: "Debounce",
    events: { Input: {} },
    internalEvents: { Due: {} },
    memory: { sequence: Schema.Int },
    initial: () => ({ sequence: 0 }),
    props: { waitMs: prop.optional(Schema.Int), onSettled: callback({}) },
  },
  ({ E, props }) => ({
    schedules: {
      settle: {
        schedule: ({ props }) => props.waitMs ?? 300,
        send: E.Due,
        restartOn: ({ memory }) => memory.sequence,
      },
    },
    on: {
      Input: {
        target: "self",
        updateMemory: ({ memory }) => ({ sequence: memory.sequence + 1 }),
      },
      Due: { target: "self", actions: [props.onSettled] },
    },
  }),
);

export const requiredError = (value: string): string | null =>
  value.trim().length === 0 ? "Required" : null;

export const RequiredField = trait(
  {
    id: "RequiredField",
    input: { value: Schema.String },
    events: { Edit: { value: Schema.String }, Blur: {} },
    hostEvents: {
      SetDraft: { value: Schema.String },
      Replace: { value: Schema.String, expectedRevision: Schema.Int },
    },
    memory: { value: Schema.String, touched: Schema.Boolean, edits: Schema.Int },
    initial: ({ input }) => ({ value: input.value, touched: false, edits: 0 }),
    props: { canEdit: guard(), onEdited: callback.optional({ value: Schema.String }) },
  },
  ({ props }) => ({
    on: {
      Edit: {
        target: "self",
        guard: props.canEdit,
        updateMemory: ({ event, memory }) => ({ value: event.value, edits: memory.edits + 1 }),
        actions: [props.onEdited.from(({ event }) => ({ value: event.value }))],
      },
      SetDraft: {
        target: "self",
        guard: props.canEdit,
        updateMemory: ({ event, memory }) => ({ value: event.value, edits: memory.edits + 1 }),
        actions: [props.onEdited.from(({ event }) => ({ value: event.value }))],
      },
      Blur: { target: "self", updateMemory: () => ({ touched: true }) },
      Replace: [
        {
          target: "self",
          guard: ({ event, memory }) =>
            event.expectedRevision === memory.edits || deny("KeepNewerEdit"),
          updateMemory: ({ event }) => ({ value: event.value }),
        },
        { target: "self" },
      ],
    },
  }),
);

export const Confirm = subroutine(
  {
    id: "ConfirmRename",
    input: { request: RenameRequest },
    memory: { request: RenameRequest },
    initial: ({ input }) => ({ request: input.request }),
    events: { Yes: {}, No: {} },
    exits: { Confirmed: { request: RenameRequest }, Declined: {} },
  },
  ({ exits }) => ({
    on: {
      Yes: exits.Confirmed.from(({ memory }) => ({ request: memory.request })),
      No: exits.Declined,
    },
  }),
);

export const CommitWithRetry = subroutine(
  {
    id: "CommitWithRetry/2",
    input: { request: RenameRequest },
    states: ["SENDING", "BACKOFF"],
    internalEvents: { RetryDue: {} },
    memory: { request: RenameRequest, retries: Schema.Int },
    initial: ({ input }) => ({ request: input.request, retries: 0 }),
    props: {
      onSend: request({
        kind: "commit",
        input: { request: RenameRequest },
        answers: {
          success: { Succeeded: { receipt: RenameReceipt } },
          failure: { Busy: {}, Rejected: { reason: Schema.String } },
        },
      }),
    },
    exits: {
      Done: { request: RenameRequest, receipt: RenameReceipt },
      GaveUp: {},
      Refused: { reason: Schema.String },
      Uncertain: { attempt: Attempt },
      Interrupted: { attempt: Attempt },
      Defected: { attempt: Attempt },
    },
  },
  ({ S, E, props, exits }) => ({
    start: {
      target: S.SENDING,
      actions: [props.onSend.from(({ memory }) => ({ request: memory.request }))],
    },
    states: {
      SENDING: {
        replies: {
          onSend: {
            Succeeded: exits.Done.from(({ memory, payload }) => ({
              request: memory.request, receipt: payload.receipt,
            })),
            Busy: [
              {
                target: S.BACKOFF,
                guard: ({ memory }) => memory.retries < 2 || deny("RetryLimit"),
                updateMemory: ({ memory }) => ({ retries: memory.retries + 1 }),
              },
              exits.GaveUp,
            ],
            Rejected: exits.Refused.from(({ payload }) => ({ reason: payload.reason })),
            unknown: exits.Uncertain.from(({ payload }) => ({ attempt: payload.attempt })),
            interrupt: exits.Interrupted.from(({ payload }) => ({ attempt: payload.attempt })),
            defect: exits.Defected.from(({ payload }) => ({ attempt: payload.attempt })),
          },
        },
      },
      BACKOFF: {
        schedules: { retry: { schedule: "2 seconds", send: E.RetryDue } },
        on: {
          RetryDue: {
            target: S.SENDING,
            actions: [props.onSend.from(({ memory }) => ({ request: memory.request }))],
          },
        },
      },
    },
  }),
);

export const Poll = subroutine(
  {
    id: "Poll/5s",
    states: ["WAITING", "REFRESHING"],
    internalEvents: { Tick: {} },
    props: {
      onRefresh: request({
        kind: "read",
        input: {},
        answers: { success: { Ready: {} }, failure: { Failed: {} } },
      }),
    },
  },
  ({ S, E, props }) => ({
    start: { target: S.REFRESHING, actions: [props.onRefresh] },
    states: {
      WAITING: {
        schedules: { next: { schedule: "5 seconds", send: E.Tick } },
        on: { Tick: { target: S.REFRESHING, actions: [props.onRefresh] } },
      },
      REFRESHING: {
        replies: {
          onRefresh: { Ready: S.WAITING, Failed: S.WAITING, interrupt: S.WAITING, defect: S.WAITING },
        },
      },
    },
  }),
);

export const AddressStep = subroutine(
  {
    id: "AddressStep",
    input: { address: Address },
    memory: { original: Address },
    initial: ({ input }) => ({ original: input.address }),
    events: { Next: {}, Back: {}, Reset: {} },
    embeds: {
      street: { trait: RequiredField, input: ({ input }) => ({ value: input.address.street }) },
      city: { trait: RequiredField, input: ({ input }) => ({ value: input.address.city }) },
    },
    exits: { Done: { address: Address }, Returned: { address: Address } },
  },
  ({ E, exits }) => ({
    embeds: {
      street: { props: { canEdit: () => true } },
      city: { props: { canEdit: () => true } },
    },
    on: {
      Next: {
        target: exits.Done.from(({ memory }) => ({
          address: { street: memory.street.value, city: memory.city.value },
        })),
        guard: ({ memory }) =>
          (requiredError(memory.street.value) === null && requiredError(memory.city.value) === null)
          || deny("InvalidAddress"),
      },
      Back: exits.Returned.from(({ memory }) => ({
        address: { street: memory.street.value, city: memory.city.value },
      })),
      Reset: {
        target: "self",
        raise: [
          E.street.SetDraft.from(({ memory }) => ({ value: memory.original.street })),
          E.city.SetDraft.from(({ memory }) => ({ value: memory.original.city })),
        ],
      },
    },
  }),
);

export const CheckoutWizard = subroutine(
  {
    id: "CheckoutWizard",
    input: { address: Address },
    memory: { original: Address },
    initial: ({ input }) => ({ original: input.address }),
    states: [{ ADDRESS: AddressStep }],
    events: { Restart: {} },
    exits: { Completed: { address: Address }, Cancelled: { address: Address } },
  },
  ({ S, exits }) => {
    const callAddress = S.ADDRESS.call.from(({ memory }) => ({ address: memory.original }));
    return {
      start: { target: callAddress },
      on: { Restart: { target: callAddress } },
      states: {
        ADDRESS: {
          exits: {
            Done: exits.Completed.from(({ payload }) => ({ address: payload.address })),
            Returned: exits.Cancelled.from(({ payload }) => ({ address: payload.address })),
          },
        },
      },
    };
  },
);
```

The `original` address is a draft checkpoint for Reset/Restart, not a mirror of a server record.
Current field values have one owner. Errors are derived, so a host cannot initialize a second,
inconsistent error cache by following these examples. Empty strings are valid draft data but
invalid for submission. Reset is a user edit and increments field revisions; Replace is a
confirmed replacement and neither advances edits nor emits onEdited.

### 3.2 Debounce host, including a trait-driven host transition

```tsx
// debounce-host.tsx
import { Schema } from "effect";
import { definition, machine, type Actor } from "flow-state";
import { useView } from "flow-state/react";
import { Debounce } from "./pieces";

export const DebounceHost = definition({
  id: "Demo/DebounceHost",
  states: ["OPEN", "LOCKED"],
  embeds: { pause: { trait: Debounce } },
  memory: { settled: Schema.Int },
  initial: () => ({ settled: 0 }),
});

export const DebounceHostMachine = machine(DebounceHost, ({ S }) => ({
  default: S.OPEN,
  embeds: {
    pause: {
      props: {
        onSettled: {
          target: S.LOCKED,
          updateMemory: ({ memory }) => ({ settled: memory.settled + 1 }),
        },
      },
    },
  },
  states: { OPEN: {}, LOCKED: {} },
}));

export function DebouncePanel({ actor }: { actor: Actor<typeof DebounceHostMachine> }) {
  const sequence = useView(actor, (s) => s.memory.pause.sequence);
  const settled = useView(actor, (s) => s.memory.settled);
  const locked = useView(actor, (s) => DebounceHost.S.LOCKED.is(s));
  return <section>
    <button onClick={() => actor.send(DebounceHost.E.pause.Input())}>Input</button>
    <output>{sequence} inputs; {settled} quiet periods; {locked ? "Locked" : "Open"}</output>
  </section>;
}
```

The timer is initially idle. Input increments sequence and arms/restarts it; one Duration fires
once after the last committed input. The callback rule is **a callback never leaves its fragment's own node**. A trait's own node
is its containing node. Here that scope is the actor root, so LOCKED is valid. A trait in a
wizard may navigate within that wizard, but cannot return from it or leave its mount. A subroutine's own node is its mount; an owner's states outside it are invalid callback
targets. This is one rule applied to the node defined by each constructor, with no self-raise workaround.

A debounce relevant only to editing belongs inside an editing subroutine. Root placement here
intentionally means actor lifetime, including LOCKED; it is not a promise to stop at every state
change. A later change to waitMs affects a later arming, not an already-armed deadline.

### 3.3 Validated field host

```tsx
// field-host.tsx
import { Schema } from "effect";
import { definition, machine, deny, check, type Actor } from "flow-state";
import { useView } from "flow-state/react";
import { RequiredField, requiredError } from "./pieces";

export const FieldHost = definition({
  id: "Demo/FieldHost",
  states: ["OPEN"],
  events: { Lock: {} },
  embeds: { title: { trait: RequiredField, input: () => ({ value: "" }) } },
  memory: { locked: Schema.Boolean },
  initial: () => ({ locked: false }),
});

export const FieldHostMachine = machine(FieldHost, ({ S }) => ({
  default: S.OPEN,
  embeds: { title: { props: { canEdit: ({ memory }) => !memory.locked || deny("Locked") } } },
  on: { Lock: { target: "self", updateMemory: () => ({ locked: true }) } },
  states: { OPEN: {} },
}));

export function FieldPanel({ actor }: { actor: Actor<typeof FieldHostMachine> }) {
  const value = useView(actor, (s) => s.memory.title.value);
  const error = useView(actor, (s) =>
    s.memory.title.touched ? requiredError(s.memory.title.value) : null);
  const editable = useView(actor, (s) =>
    check(s, FieldHost.E.title.Edit({ value: s.memory.title.value }))._tag === "Allowed");
  return <section>
    <input value={value} disabled={!editable}
      onChange={(e) => actor.send(FieldHost.E.title.Edit({ value: e.target.value }))}
      onBlur={() => actor.send(FieldHost.E.title.Blur())} />
    <span>{error}</span>
    <button onClick={() => actor.send(FieldHost.E.Lock())}>Lock</button>
  </section>;
}
```

The definition knows the initial field value without the machine's props. onEdited is optional
and intentionally unbound; check lists that omission. `FieldHost.E.title.Replace` is unavailable
to external senders, and a hand-written public envelope naming it fails Event decoding.

### 3.4 Confirmation host

```tsx
// confirm-host.tsx
import { Schema } from "effect";
import { definition, machine, type Actor } from "flow-state";
import { useView } from "flow-state/react";
import { Confirm, RenameRequest } from "./pieces";

export const ConfirmHost = definition({
  id: "Demo/ConfirmHost",
  states: ["IDLE", { ASK: Confirm }, "ACCEPTED"],
  events: { Ask: { request: RenameRequest }, Leave: {} },
  memory: { acceptedId: Schema.NullOr(Schema.String) },
  initial: () => ({ acceptedId: null }),
});

export const ConfirmHostMachine = machine(ConfirmHost, ({ S }) => ({
  default: S.IDLE,
  states: {
    IDLE: { on: { Ask: { target: S.ASK.call.from(({ event }) => ({ request: event.request })) } } },
    ASK: {
      on: { Leave: S.IDLE },
      exits: {
        Confirmed: {
          target: S.ACCEPTED,
          updateMemory: ({ payload }) => ({ acceptedId: payload.request.ticketId }),
        },
        Declined: S.IDLE,
      },
    },
    ACCEPTED: { on: { Leave: S.IDLE } },
  },
}));

export function ConfirmPanel({ actor }: { actor: Actor<typeof ConfirmHostMachine> }) {
  const question = useView(actor, (s) => s.memory.ASK?.request.title);
  const acceptedId = useView(actor, (s) => s.memory.acceptedId);
  return <section>
    <button onClick={() => actor.send(ConfirmHost.E.Ask({
      request: { ticketId: "T1", title: "New title", revision: 0 },
    }))}>Ask</button>
    <p>{question ?? acceptedId ?? "No confirmation open"}</p>
    <button onClick={() => actor.send(ConfirmHost.E.ASK.Yes())}>Yes</button>
    <button onClick={() => actor.send(ConfirmHost.E.ASK.No())}>No</button>
    <button onClick={() => actor.send(ConfirmHost.E.Leave())}>Leave</button>
  </section>;
}
```

Yes/No are the confirmation's declared public inputs; no forwarding layer can suppress them.
Leave abandons, never manufactures Declined. The request displayed is exactly the request
returned. A confirmation requiring host-mediated inputs would declare those in hostEvents;
the author must justify which inputs may safely be withheld.

### 3.5 Confirmed commit, retries, abandonment and reconciliation

```tsx
// rename-host.tsx
import { Schema } from "effect";
import { definition, machine, deny, check, Attempt, type Actor } from "flow-state";
import { useView } from "flow-state/react";
import { RequiredField, requiredError, Confirm, CommitWithRetry, SaveTitle, RenameReceipt } from "./pieces";

export const RenameHost = definition({
  id: "Demo/RenameHost",
  states: ["EDITING", { ASK: Confirm }, { SAVE: CommitWithRetry }, "DONE", "FAILED", "UNCERTAIN", "RECONCILING"],
  events: { Submit: {}, Leave: {}, EditAgain: {}, Reconcile: { attempt: Attempt } },
  internalEvents: {
    Reconciled: { receipt: RenameReceipt },
    ReconcileFailed: { reason: Schema.String },
    ReconcileUnknown: { attempt: Attempt },
    ReconcileInterrupted: {},
    ReconcileDefected: {},
  },
  embeds: { title: { trait: RequiredField, input: () => ({ value: "" }) } },
  input: { ticketId: Schema.String },
  memory: {
    ticketId: Schema.String,
    error: Schema.String,
    unresolved: Schema.NullOr(Attempt),
    recoveryStatus: Schema.String,
  },
  initial: ({ input }) => ({ ticketId: input.ticketId, error: "", unresolved: null, recoveryStatus: "None" }),
  operations: { saveTitle: SaveTitle },
});

export const RenameHostMachine = machine(RenameHost, ({ S, E, O }) => ({
  default: S.EDITING,
  embeds: { title: { props: { canEdit: () => true } } },
  on: {
    Reconcile: {
      target: S.RECONCILING,
      guard: ({ event, memory, state }) =>
        (state !== "RECONCILING" && memory.unresolved?.id === event.attempt.id) || deny("NoMatchingAttempt"),
      actions: [O.saveTitle.retry(({ event, memory }) => memory.unresolved ?? event.attempt, {
        outcomes: {
          success: E.Reconciled.from((receipt) => ({ receipt })),
          failure: {
            Busy: E.ReconcileFailed.from(() => ({ reason: "Refused without a write" })),
            Rejected: E.ReconcileFailed.from((e) => ({ reason: e.reason })),
          },
          unknown: E.ReconcileUnknown.from((attempt) => ({ attempt })),
          interrupt: E.ReconcileInterrupted,
          defect: E.ReconcileDefected,
        },
      })],
    },
  },
  states: {
    EDITING: {
      on: {
        Submit: {
          target: S.ASK.call.from(({ memory }) => ({
            request: { ticketId: memory.ticketId, title: memory.title.value, revision: memory.title.edits },
          })),
          guard: ({ memory }) => memory.unresolved === null
            ? (requiredError(memory.title.value) === null || deny("InvalidTitle"))
            : deny("ReconcilePreviousWrite"),
        },
      },
    },
    ASK: {
      on: { Leave: S.EDITING },
      exits: {
        Confirmed: { target: S.SAVE.call.from(({ payload }) => ({ request: payload.request })) },
        Declined: S.EDITING,
      },
    },
    SAVE: {
      props: {
        onSend: ({ O, reply }) => ({
          actions: [O.saveTitle.commit(({ payload }) => payload.request, {
            outcomes: {
              success: reply.Succeeded.from((receipt) => ({ receipt })),
              failure: {
                Busy: reply.Busy,
                Rejected: reply.Rejected.from((e) => ({ reason: e.reason })),
              },
            },
          })],
          abandoned: {
            updateMemory: ({ attempt, outcome }) => {
              switch (outcome._tag) {
                case "Pending":
                  return { unresolved: attempt, recoveryStatus: "Pending", error: "Previous write still pending" };
                case "Success":
                  return { unresolved: attempt, recoveryStatus: "Succeeded", error: "Previous write succeeded; reconcile to continue" };
                case "Failure":
                  return {
                    unresolved: null,
                    recoveryStatus: "None",
                    error: outcome.error._tag === "Busy" ? "Previous write was refused" : outcome.error.reason,
                  };
                case "Unknown":
                  return { unresolved: attempt, recoveryStatus: "Unknown", error: "Previous write needs reconciliation" };
                case "Interrupt":
                  return { unresolved: attempt, recoveryStatus: "Interrupted", error: "Previous write interrupted; may have run" };
                case "Defect":
                  return { unresolved: attempt, recoveryStatus: "Defected", error: "Inspect defect and reconcile" };
                default: {
                  const exhaustive: never = outcome;
                  return exhaustive;
                }
              }
            },
          },
        }),
      },
      on: { Leave: S.EDITING },
      exits: {
        Done: {
          target: S.DONE,
          updateMemory: () => ({ error: "", unresolved: null, recoveryStatus: "None" }),
          raise: [E.title.Replace.from(({ payload }) => ({
            value: payload.receipt.title, expectedRevision: payload.request.revision,
          }))],
        },
        GaveUp: { target: S.FAILED, updateMemory: () => ({ error: "Busy after three sends" }) },
        Refused: { target: S.FAILED, updateMemory: ({ payload }) => ({ error: payload.reason }) },
        Uncertain: {
          target: S.UNCERTAIN,
          updateMemory: ({ payload }) => ({ error: "Write needs reconciliation", unresolved: payload.attempt, recoveryStatus: "Unknown" }),
        },
        Interrupted: {
          target: S.UNCERTAIN,
          updateMemory: ({ payload }) => ({ error: "Interrupted; write may have run", unresolved: payload.attempt, recoveryStatus: "Interrupted" }),
        },
        Defected: {
          target: S.UNCERTAIN,
          updateMemory: ({ payload }) => ({ error: "Inspect defect and reconcile", unresolved: payload.attempt, recoveryStatus: "Defected" }),
        },
      },
    },
    DONE: { on: { EditAgain: S.EDITING } },
    FAILED: { on: { EditAgain: S.EDITING } },
    UNCERTAIN: {},
    RECONCILING: {
      on: {
        Reconciled: {
          target: S.DONE,
          updateMemory: () => ({ unresolved: null, recoveryStatus: "None", error: "" }),
        },
        ReconcileFailed: {
          target: S.FAILED,
          updateMemory: ({ event }) => ({ unresolved: null, recoveryStatus: "None", error: event.reason }),
        },
        ReconcileUnknown: {
          target: S.UNCERTAIN,
          updateMemory: ({ event }) => ({ unresolved: event.attempt, recoveryStatus: "Unknown", error: "Still uncertain" }),
        },
        ReconcileInterrupted: { target: S.UNCERTAIN },
        ReconcileDefected: { target: S.UNCERTAIN },
      },
    },
  },
}));

export function RenamePanel({ actor }: { actor: Actor<typeof RenameHostMachine> }) {
  const value = useView(actor, (s) => s.memory.title.value);
  const confirming = useView(actor, (s) => s.memory.ASK?.request.title);
  const retrying = useView(actor, (s) => RenameHost.S.SAVE.BACKOFF.is(s));
  const error = useView(actor, (s) => s.memory.error);
  const unresolved = useView(actor, (s) => s.memory.unresolved);
  const canSubmit = useView(actor, (s) => check(s, RenameHost.E.Submit())._tag === "Allowed");
  const canReconcile = useView(actor, (s) => s.memory.unresolved === null ? false :
    check(s, RenameHost.E.Reconcile({ attempt: s.memory.unresolved }))._tag === "Allowed");
  return <section>
    <input value={value}
      onChange={(e) => actor.send(RenameHost.E.title.Edit({ value: e.target.value }))}
      onBlur={() => actor.send(RenameHost.E.title.Blur())} />
    <button disabled={!canSubmit} onClick={() => actor.send(RenameHost.E.Submit())}>Submit</button>
    <p>{confirming === undefined ? "" : `Confirm: ${confirming}`}</p>
    <button onClick={() => actor.send(RenameHost.E.ASK.Yes())}>Confirm</button>
    <button onClick={() => actor.send(RenameHost.E.ASK.No())}>Decline</button>
    <button onClick={() => actor.send(RenameHost.E.Leave())}>Leave step</button>
    <button onClick={() => actor.send(RenameHost.E.EditAgain())}>Edit again</button>
    <button disabled={!canReconcile} onClick={() => {
      if (unresolved !== null) actor.send(RenameHost.E.Reconcile({ attempt: unresolved }));
    }}>Reconcile previous write</button>
    <output>{retrying ? "Waiting before retry" : error}</output>
  </section>;
}
```

There are at most three fresh sends: the first and two retries. Only the adapter's **Busy** typed
failure retries; the adapter contract here says Busy/Rejected refused the write. No unknown,
interrupt or defect is mapped to Busy. All sends use the confirmed request captured at call,
never current fields. Editing while confirming/sending is allowed and does not change that request.

Replace is **total**: apply if its revision matches, otherwise accept a no-op. Thus a newer edit
survives without declining the successful save's return. No optional raise syntax is needed.
Replace never emits onEdited, so server normalization cannot feed the user-edit debounce.

Leave during SENDING observes Pending and records the exact Attempt **in the departure turn**, before returning to
EDITING. Success, Unknown, Interrupt and Defect keep it recorded; a definitive Busy/Rejected Failure
clears it immediately. Submit refuses while it is recorded, including the gap before an old
response arrives. Reconcile calls `retry(attempt)`,
which preserves id/input; a known settlement can resolve without a second remote invocation.
It is not a fresh `commit`. Interrupt says “may have run”, not “not invoked”. A resolved prior
success must be observed before another edit flow; this is explicit application policy, not a
universal guarantee that an application can never submit the same business command twice.
The event's Attempt id is checked against retained recovery memory; the retry selector uses
that retained Attempt, not caller-controlled changes to an otherwise matching event payload.
With serialize, the old occurrence's terminal delivery is queued before the queued retry's
settlement; ordinary actor FIFO keeps that old recovery update before Reconciled clears it.

Cache writes still belong on the operation and apply even after state exit. The abandoned
observer is non-targeting and cannot raise; a late outcome never throws the current wizard out
of its state. An explicit Reconcile user event is what changes workflow state. Root field traits
survive SAVE departure, so the current draft is not discarded.

### 3.6 Poll until the host leaves

```tsx
// poll-host.tsx
import { definition, machine, type Actor } from "flow-state";
import { useView } from "flow-state/react";
import { Poll, ReadQueue } from "./pieces";

export const PollHost = definition({
  id: "Demo/PollHost",
  states: ["CLOSED", { LIVE: Poll }],
  events: { Open: {}, Close: {} },
  operations: { queue: ReadQueue },
});

export const PollHostMachine = machine(PollHost, ({ S, O }) => ({
  default: S.CLOSED,
  states: {
    CLOSED: { on: { Open: { target: S.LIVE.call() } } },
    LIVE: {
      activities: { queue: O.queue.subscribe(() => ({})) },
      props: {
        onRefresh: ({ O, reply }) => ({
          actions: [O.queue.refetch(() => ({}), { outcomes: { success: reply.Ready } })],
        }),
      },
      on: { Close: S.CLOSED },
      },
  },
}));

export function PollPanel({ actor }: { actor: Actor<typeof PollHostMachine> }) {
  const label = useView(actor, (s) => s.activities.LIVE?.queue?.data?.label);
  const refreshing = useView(actor, (s) => PollHost.S.LIVE.REFRESHING.is(s));
  return <section>
    <button onClick={() => actor.send(PollHost.E.Open())}>Open</button>
    <button onClick={() => actor.send(PollHost.E.Close())}>Close</button>
    <output>{refreshing ? "Refreshing" : label ?? "Closed or loading"}</output>
  </section>;
}
```

ReadQueue has E = never, so failure mapping is forbidden. Poll's semantic Failed reply may be
unused by a particular infallible binding. A fallible binding maps all its tags to Failed.
Read request kinds always generate interrupt/defect and never unknown. Closing from either
state cancels the timer and releases the host activity; it cannot veto an already-issued
finite refetch's normal cache consequences. Old replies are fenced. On restore, a saved pending
read is answered interrupt, which moves Poll to WAITING and arms the next five-second timer.
No request is silently assumed to have survived the old Runtime.

The initial refresh is in start; no WAITING timer is armed/discarded during startup. Later
polls wait five seconds **after** settlement, with one pending request per port. The host's
subscription shares the initial lookup/refetch and supplies a lane without copying data into
fragment memory. `activities.LIVE.queue` is an explicit snapshot-shape extension for activities
owned by the host at a subroutine placement; ordinary flat activities keep their existing paths.

### 3.7 Checkout wizard → address step → two fields

```tsx
// checkout-host.tsx
import { definition, machine, check, type Actor } from "flow-state";
import { useView } from "flow-state/react";
import { CheckoutWizard, Address } from "./pieces";

export const CheckoutHost = definition({
  id: "Demo/CheckoutHost",
  states: ["CART", { WIZARD: CheckoutWizard }, "READY"],
  events: { Checkout: {}, Leave: {}, EditAddress: {} },
  memory: { address: Address },
  initial: () => ({ address: { street: "", city: "" } }),
});

export const CheckoutHostMachine = machine(CheckoutHost, ({ S }) => {
  const callWizard = S.WIZARD.call.from(({ memory }) => ({ address: memory.address }));
  return {
    default: S.CART,
    states: {
      CART: { on: { Checkout: { target: callWizard } } },
      WIZARD: {
        on: {
          Leave: {
            target: S.CART,
            updateMemory: ({ memory }) => ({
              address: memory.WIZARD?.ADDRESS === undefined ? memory.address : {
                street: memory.WIZARD.ADDRESS.street.value,
                city: memory.WIZARD.ADDRESS.city.value,
              },
            }),
          },
        },
        exits: {
          Completed: { target: S.READY, updateMemory: ({ payload }) => ({ address: payload.address }) },
          Cancelled: { target: S.CART, updateMemory: ({ payload }) => ({ address: payload.address }) },
        },
      },
      READY: { on: { EditAddress: { target: callWizard } } },
    },
  };
});

export function CheckoutPanel({ actor }: { actor: Actor<typeof CheckoutHostMachine> }) {
  const street = useView(actor, (s) => s.memory.WIZARD?.ADDRESS?.street.value);
  const city = useView(actor, (s) => s.memory.WIZARD?.ADDRESS?.city.value);
  const saved = useView(actor, (s) => s.memory.address);
  const canNext = useView(actor, (s) =>
    check(s, CheckoutHost.E.WIZARD.ADDRESS.Next())._tag === "Allowed");
  return <section>
    <button onClick={() => actor.send(CheckoutHost.E.Checkout())}>Checkout</button>
    <input aria-label="Street" value={street ?? ""} disabled={street === undefined}
      onChange={(e) => actor.send(CheckoutHost.E.WIZARD.ADDRESS.street.Edit({ value: e.target.value }))}
      onBlur={() => actor.send(CheckoutHost.E.WIZARD.ADDRESS.street.Blur())} />
    <input aria-label="City" value={city ?? ""} disabled={city === undefined}
      onChange={(e) => actor.send(CheckoutHost.E.WIZARD.ADDRESS.city.Edit({ value: e.target.value }))}
      onBlur={() => actor.send(CheckoutHost.E.WIZARD.ADDRESS.city.Blur())} />
    <button disabled={!canNext} onClick={() => actor.send(CheckoutHost.E.WIZARD.ADDRESS.Next())}>Next</button>
    <button onClick={() => actor.send(CheckoutHost.E.WIZARD.ADDRESS.Back())}>Back</button>
    <button onClick={() => actor.send(CheckoutHost.E.WIZARD.ADDRESS.Reset())}>Reset fields</button>
    <button onClick={() => actor.send(CheckoutHost.E.WIZARD.Restart())}>Restart address</button>
    <button onClick={() => actor.send(CheckoutHost.E.Leave())}>Leave wizard</button>
    <button onClick={() => actor.send(CheckoutHost.E.EditAddress())}>Edit address</button>
    <output>{saved.street}, {saved.city}</output>
  </section>;
}
```

The send and read paths match: WIZARD.ADDRESS.street. Public input visibility is declared once
by its owner; no ancestor repeats an export or event schema. Replace remains placer-only across
all levels. Back returns the draft; Leave deliberately preserves the active draft before its
slices disappear. Restart deliberately discards edits in favour of the entry checkpoint.
Such product choices are explicit; the library cannot universally infer “preserve” versus “discard”.

## 4. The rules: one numbered list

This is the canonical list: **16 rule groups, approximately 55 semantic obligations**. Later subsections explain these rules and their
proof obligations; they do not introduce a second independent rules list. Types and flow check
apply the same structural rules to typed and untyped declarations. Opaque callback data and
runtime ordering still need admission checks and executable proofs.

1. **Kind and node.** A trait lives with its containing node and has no states/start/exits;
   a subroutine owns its mount. These are each fragment's own node. Omitted event/exit records
   are empty; a stateless no-work subroutine's omitted start means self with no actions.
2. **Definition and ownership.** Definitions own structure and seed data; behaviour binds at the
   same path. A fragment writes its own slice and binds direct children. Only root machines
   bind operations, services or actor context. Construction is inert and deterministic.
3. **Fixed input.** Schema-admitted input seeds initial. Trait seeds are definition-side selectors
   of admitted owner input/own initial memory only. Calls carry subroutine input. initial never
   reads props, clock, activities or other child slices.
4. **Live dependencies.** Props declare current values, policy, notifications and requests.
   Dependencies are required unless a value/notification explicitly uses .optional. Guards
   never default to allow. Missing required bindings reject; optional omission is inspected.
5. **Senders.** Public events route directly to their owner at the actual nested path. Only the
   direct placer raises hostEvents. Internal producers own internalEvents. Parents cannot
   intercept public descendants or write child memory. Raise has no public-event/self/ancestor route.
6. **Explicit calls.** Every subroutine entry/re-entry uses call with its arguments; no subroutine
   is a default. Stateful start is one static unguarded target plus request actions, appended to
   the call. No startup raise/notification/return/hidden entry effect or replay on restore exists.
7. **Captured reads and check.** Surviving scopes read pre-turn snapshots; new starts read their
   initialized memory. Call arguments never see a pending patch. check follows the same guards
   and guard-dependent payload maps, never updates/initializers/action selectors or live effects.
8. **One composed turn.** A raise declining/unhandled declines its source candidate before any
   changes, with ordinary alternatives/fallthrough. Merge disjoint patches/actions and one
   compatible target chain, then validate/publish once. Self is not a state change. Overlapping
   keys, incompatible targets and raising into a new/leaving activation reject.
9. **Consumed-delivery totality.** A reply, exit continuation or live fragment timer firing cannot
   decline, including every notification/raise reachable from it. All alternatives together
   must have an unguarded enabled path; every raised command in that chain must be structurally
   total. Stale activation/arming discard and defects are distinct from a guard refusing delivery.
10. **Callbacks and exits.** A callback never leaves the fragment's own node (R1); an exit does.
    Exit mappings are exhaustive, non-vetoing and cannot ignore/self-return or target inside the
    returning implementation. Callback/exit payloads cross only the declared Schema boundary.
11. **Request binding.** One binding form uses lexical branded reply producers and exactly one
    kind-compatible finite operation or exact protocol delegation. Select sees payload only.
    Host maps success/actual failure tags to their matching classes; kind supplies standard
    unknown/interrupt/defect. Reject concurrency, empty/conditional work and foreign producers reject.
12. **Admitted requests only.** At most one occurrence per prop is pending. Publish its id/wait
    only with valid operation admission; a failed/duplicate admission produces no phantom reply.
    Deliver once to the exact admitted request. Silent cancel closes an active request with
    interrupt; a post-commit projection defect closes it with defect plus its diagnostic.
13. **Abandoned commits.** One non-targeting/no-raise observer receives Attempt plus a tagged
    outcome, including synchronous Pending in the departure batch. Routes survive enclosing
    exits/relays/restore. Pending/source patches on the same key conflict; late facts run normal
    validated host turns. Product submission gating and definitive-failure policy remain explicit.
14. **Lifetime and recovery.** Calls initialize fresh; exit stops schedules and fences normal
    replies by incarnation/activation/request and timers by arming identity. Commits retain cache
    consequences and recovery routes. Restore never replays start/commit; pending reads interrupt,
    pending commits recover known settlement or unknown/interrupt with preserved correlation.
15. **Finite automatic flow.** The structural same-turn raise/callback/call/return graph is acyclic;
    operation/timer boundaries break cycles. restartOn keeps its silent entry baseline and compares
    only final committed state; its entry trap remains a warning and a behavioural proof obligation.
16. **One execution/test model.** story.fragment generates a normal host and uses the production
    props/operation binding shape, Schema input, guards and Layer fixtures. Only declared public
    host events drive calls/leaves. Inspection/graph/evidence retain all owners, routes and ids;
    tools never run behaviour to discover hidden edges or claim arbitrary callback correctness.

### 4.1 Input authority and refusal by forwarding

Borrowed from **opus-split**: `events` means public everywhere, `hostEvents` means only the direct
placer may raise it, and `internalEvents` belongs to schedules/other declared producers. Only
public events join the actor's Event Schema under their actual nested path. A parent cannot
hide, guard, intercept, retag or override a descendant's public event. It cannot handle a child
input in its own `on`. That input routes straight to its owner and is Unhandled while inactive.

For hold-to-confirm, Release is public and unguarded; no ancestor can refuse it by forgetting
forwarding. Press may be public with a declared canPress guard, or hostEvents if host mediation
is intentional. A field's Edit may be public with canEdit. A toggle whose mutation must follow
persistence uses hostEvents.Apply, with a public host PinRequested operation workflow. Public
mutation inputs are therefore an explicit **fragment-author** decision. H1 is “allows by public
contract”, not a claim that every public input automatically satisfies a future host policy.

The compiler enforces the three producer sets and their ownership for typed and untyped callers.
It cannot prove that an author chose the correct set for business invariants. If an invariant
requires Release delivery, declaring it hostEvents is a contract error by the author that needs
a behavioural test; the library does not infer invariant-carrying events from their names.
A host needing an unforeseen check revises that contract or writes the workflow locally.

### 4.2 Calls, starts, targets and returns

Start has one static target: self for a stateless step, a direct ordinary child or an explicit
call for a stateful step. Its optional actions request work. It is appended exactly once to an
explicit call and never independently scheduled. No subroutine can be a default. An owner may
reuse a named call descriptor when several routes supply identical arguments, as Checkout does.

An exit token is a return, not a constructible event. Its mapping is exhaustive and cannot veto,
ignore, target self or jump inside the returning child. It may target a host state, call another
step, or return its owner's exit. Mapping data uses payload. A callback never leaves its fragment's own node (R1/R10). Conflicting targets
reject at construction, not by precedence. Callback handlers cannot supply guards.

| Composed parts | Result |
| --- | --- |
| Source self, raised child self | Merge disjoint patches/actions. |
| Source self, raised active step changes its local state | That local state is the effective target. |
| Trait callback targets within its containing scope | Allowed; it does not end the trait's lifetime scope. |
| Child returns and owner maps the exit | One explicit return chain; payloads are validated before slices disappear. |
| Two unrelated non-self targets | Construction error, even if author order might appear to choose one. |
| Source leaves the lifetime of a child it also raises into | Construction error; no effects may be hidden in a disappearing scope. |
| Target calls a new child and source raises into that new activation | Construction error; pass input and use its unguarded start instead. |
| Callback tries to leave a subroutine's mount or return its exit | Construction error; use a declared exit from the subroutine. |

Raises target only hostEvents of a direct child, never public events, the authoring scope's
events, ancestors, foreign siblings, start, replies or exits. Public events already have a
direct public route. Reset uses the private SetDraft command, whose handler has the same
user-edit semantics as public Edit; confirmed Replace is separate and silent. Thus a callback cannot bypass target restrictions by raising
its own owner's Close. Public inputs reach descendants through their direct public paths;
private control crosses each immediate boundary explicitly. No external actor gains child
reply/target authority merely because it can read a nested snapshot.

### 4.3 Whole-turn composition and `check`

Borrowed from **opus-single / sonnet-split**: a raised input is part of the same
transition. Choose source alternatives in authored order and ancestors by existing nearest-handler
rules; for each candidate, recursively choose raised handlers against the **same pre-turn
snapshot**. If any child alternative chain declines or is unhandled, that source candidate
also declines. Continue source alternatives/fallthrough. No patch, target, timer or action from
a rejected candidate is applied. check includes the inner denial path and authored order.

An initially unhandled public input stays Unhandled. A source handler whose raised
child is unhandled is Denied with the framework reason RaisedCommandUnhandled and the child
path. A guarded list with a final unguarded no-op is total. RequiredField.Replace uses that
form: preserving a newer draft is an accepted child decision, not a dropped command.

After all guards accept, compute patches, call arguments, return/notification payloads and
operation parameters from those captured inputs. Merge disjoint owner/key patches, resolve the
single target/return/call chain, initialize newly called scopes, append their unguarded start
requests, validate the whole batch, and publish once. Overlapping patch keys or incompatible
targets are construction conflicts; opaque/dynamic conflicts reject before publication. Newly
called start chains cannot raise or notify, so they introduce no new guard dependencies on
initializer/action projections. No surviving scope sees another part's memory patch.
Request payload/operation selectors belonging to a new start are evaluated after its pure
initialization, against that entry memory and the captured request payload respectively; this
is the explicit new-scope exception, not visibility of a surviving scope's pending update.

R9 is the single totality rule: a consumed reply, exit continuation or live fragment timer
firing cannot decline. This includes timer-fired notifications and all downstream raises/returns.
A final unguarded alternative is how a guarded handler proves a complete path; it is not an
optional-delivery escape hatch. flow check follows the full reachable automatic chain, including
host bindings, and errors if any handler/raised hostEvent can refuse it. For example, a timer
notification raising a guarded-only SetDraft is invalid; raising total Replace is valid.
Stale timer/request identity discard remains intentional, with evidence. Pure callback defects
retain Plan issue/no-retry behaviour; R9 excludes declared refusal, not arbitrary defective TS.

The automatic same-turn production graph must be acyclic. This includes raises, notifications,
call/start and returns, but not later operation replies or timer firings. This conservative
structural test rejects some guard-bounded loops rather than claiming to solve TS termination.
It also rejects start requests guaranteed to originate in a scope left before publication.

**No reducer dry-run:** check never runs updateMemory, initializers, action-parameter selectors,
request admission, state mutation or memory projections. It evaluates guards and only the
pure event/notification payload mappings required to supply inputs to a composed guard. Calls
and their unguarded starts introduce no guard to evaluate, so check need not initialize them.
It retains the Plans' limitation that a later invalid action/payload can defect despite Allowed.

This is a smaller Machines O4 amendment than round 0, but is not literally “guards only”. A
source mapping `{ raw: " " }` to a child's `{ value: raw.trim() }` cannot check that child's
nonempty-value guard correctly without computing trim. A mapper-free guard-only check with
arbitrary mapped raised payloads is impossible. The alternative is to forbid such mappings;
this proposal explicitly rejects that restriction. Mapping defects throw a path-specific
FlowError from check; they publish nothing. Evidence/explain records actual guards at runtime.

### 4.4 Request kinds, lexical replies and complete outcomes

Borrowed from **opus-split**, with the class check retained: `request.kind` is commit or read.
The fragment names success/failure semantic replies, grouped by their actual outcome class.
Those names are unique across groups. Host success can map only to a success reply, and each
actual failure tag only to a failure reply. A failure cannot map to Succeeded, even with a
syntactically matching payload. The fragment handles every declared reply in `replies`.
Names unknown, interrupt and defect are reserved for the generated standard replies.

The kind supplies these **fixed, Schema-backed** standard replies automatically:

| Kind | Required automatic replies | Host mapping |
| --- | --- | --- |
| commit | unknown/interrupt/defect, each `{ attempt: Attempt }` | Forbidden: compiler routes them unchanged to the fragment. |
| read | interrupt/defect, each `{}`; unknown does not exist | Forbidden: compiler routes them to the fragment. |

Standard replies are framework names, unlike author-chosen Succeeded/Busy. Attempt is the
exported Schema, not a copied structural approximation. Commit interrupt does not assert
“never invoked”; adapter interruption may happen after invocation. Defect also does not assert
that a remote write was absent. Both retain the Attempt for explicit investigation/reconciliation.
Raw Cause values stay at the in-process diagnostic boundary, never in encoded replies.

The host binds exactly one compatible finite operation: commit/retry for kind commit,
lookup/refetch for kind read. Its outcomes contains success and an exhaustive failure mapping
when E is not never; E = never forbids failure. Unused semantic failure replies are allowed.
Only the host knows its error tags; only the fragment decides what uncertainty means locally.
The parameter selector receives **`{ payload }` only**, not live host memory, context, activities,
event or now. The request must contain all variable command data. Services supply capabilities.

The request binding's `({ reply }) => ...` runs once at construction, not during behaviour.
It gets only that binding's success/failure producers. Producers carry request-path and outcome
class brands; the operation action is stamped with the same path by the binding compiler.
Types reject a mismatched brand, and construction checks token origin and consumption path for
untyped input. Lexical scope reduces accidental misuse; scope alone is not the proof because
JS values can escape closures. A producer cannot be sent, raised, reused in an unrelated action
or serialized as authority. Tools see the complete returned binding without running behaviour.

One request per prop may be pending per activation. Two issues in the same fused candidate are
a construction error. A later event that attempts a second issue before settlement fails
validation before publication, preserving the first request; possible later-event re-issuance
is a warning, not a claim that flow check can prove what its memory guard will do. As with an
invalid operation action, check may report Allowed before that admission error; it cannot
promise that arbitrary action parameters/admission succeed.
Every reachable state while pending must retain total reply handlers or leave the activation.
The read/commit kind closes the wait on all actual outcomes. Reject concurrency is forbidden
for required requests; use serialize/allow/cancel. Admission overflow rejects the whole
originating turn before a wait is published. Pre-invocation explicit cancellation closes an
active request with interrupt; non-request actions retain their existing silent-cancel rule.

A request-bound post-commit outcome/optimistic/write projection defect that would suppress
terminal delivery records the issue and supplies the fixed defect reply without invoking
another mapper. Its actual settlement/Attempt remains in operation evidence. A normal invalid
write batch that already preserves success delivery does not produce a second reply. A defective
local reply handler still reports an issue and is not automatically retried; no API can promise
business progress after arbitrary defective TS. An adapter that never settles needs an explicit
timeout or owner departure.

An enclosing fragment may relay a child's request through its own declared request prop, using
`actions: [props.onSend.from(({ payload }) => payload)]` and the identical kind/reply contract.
The compiler records a bidirectional relay: the response returns to the original request id.
It does not hand the root machine a grandchild's producer. Required abandonment routing follows
the bound commit through such relays and survives all containing-scope exits.

### 4.5 One abandoned observer, including the departure turn

R13 retains the codex-single recovery idea and the synchronous-departure guarantee from this
proposal, using the audit's single-handler surface. A commit binding has one observer:

```ts
// Envelope notation: A and E are that operation's inferred success/error types.
// This is type notation for the framework fact, not a second request-binding API.
type AbandonedOutcome<A, E> =
  | { _tag: "Pending" }
  | { _tag: "Success"; value: A }
  | { _tag: "Failure"; error: E }
  | { _tag: "Unknown" }
  | { _tag: "Interrupt" }
  | { _tag: "Defect" };
```

`abandoned: { updateMemory?, actions? }` receives `{ memory, context, activities, now, attempt,
outcome }` captured in the surviving root host, with the inferred outcome union. This is not
an operation selector: selectors still receive payload only. The observer receives the raw
operation success/error, not a semantic fragment reply. Its lexical placement identifies the
request binding; durable metadata retains that path even when multiple bindings share an
operation descriptor. It cannot target, call, raise, guard or invoke callbacks. No per-tag
routing map is required; one observer receives every case. Schema/admission and diagnostic
redaction still apply; raw Cause stays in the issue/evidence, not in this union.
The displayed type is notation for that inferred in-process context, not a second authored
Schema. A/E remain the operation's typed channels. Persistence/export retains fixed tags,
Attempt/correlation and validated host projections, never arbitrary raw typed errors or Cause.
A restore lacking an encodable terminal fact uses the existing conservative unknown/interrupt
recovery rather than inventing an E value for a Failure branch.

For any owner/ancestor transition or re-entry invalidating a pending commit's origin, the
observer receives **Pending synchronously inside that departure's batch** with the exact
admitted Attempt. The step may leave without cancelling, but flow check rejects a missing
surviving observer. A cancellation is not an exemption: post-invocation cancel can be Unknown.
The same observer subsequently receives the one terminal fact through a non-targeting host
turn. If settlement was already queued when departure committed, delivery re-checks the owner
and selects this observer rather than dropping the fact at the obsolete activation fence.

**Patch conflict is deliberate:** Pending joins the source transition in the same publication.
If both write error (or another identical owner/key), construction rejects the composition.
Move that departure presentation update into the Pending branch, as RenameHost does, or write
disjoint keys. There is no implicit last-writer-wins ordering and no extra publication.

A late outcome is an internal operation-fact turn under Machines O3/Runtime ordering, not a
public event or an exception that mutates memory out of turn. Its patch and finite host actions
validate together and publish atomically, without changing state. Actions retain their ordinary
declared operation/send edges. A projection/observer defect records an issue; it does not erase
the outstanding recovery record or fabricate success. Terminal routing/consumption is recorded
with actor capture; restore cannot pair post-Failure host memory with a pre-Failure pending
route and silently resurrect that already-consumed obligation.

Routes and Attempts survive relays, enclosing exits and restore. A route from an abandoned
middle fragment resolves through its declared request relay to the root binding, never freed
child memory. Abrupt crash cannot run Pending: if the origin is absent in a compatible restored
capture, the durable outstanding record creates the same recovery obligation before public
admission. If the capture predates terminal consumption, recovery is conservatively unresolved;
if it includes consumption, that closed route is not replayed. Disposal retains existing durable
Attempt rules and never delivers into another actor incarnation. Cache writes keep their normal
owner regardless of actor state. Exactly one terminal normal/recovery route is consumed.

**Application policy remains explicit.** RenameHost records Attempt on Pending and blocks Submit.
It keeps Success/Unknown/Interrupt/Defect for inspection or same-Attempt reconciliation. It clears
unresolved immediately on its adapter's definitive Busy/Rejected Failure: those tags mean the
write was refused. It never retries a refused old command after reload merely to clear a UI flag.
A different adapter's typed error may need a different policy; no arbitrary Failure is guaranteed
side-effect-free by this API. Presence/ownership of the observer is enforced; correct product
submission gating and meaning of error tags remain conventions. An automatic per-key barrier
would be a separate Operations concurrency design, not a hidden feature of this observer.

### 4.6 Lifecycle, restore and schedules

Every call creates fresh memory and descendant activations. Schedules stop on scope exit.
Each emitted request captures actor incarnation, containing activations and a request id;
normal delivery requires that exact request to remain pending. A duplicate/obsolete read reply
is discarded with evidence. An obsolete commit uses abandoned routing instead. Re-entry never
adopts an old request just because its instance name matches. Inspection exposes all ids and
owners as data; opaque producer authority cannot be restored from a public envelope.

Pending commit recovery follows Operations/Persistence: acknowledged work becomes unknown
unless a durable terminal result is known; never-invoked work becomes interrupt. **Every saved
pending finite read becomes interrupt** before new public inputs are processed. There is no
Attempt for a read, and no automatic replay of that read request. Its subscription may restart
under existing activity rules; that is distinct from answering the old finite request.

Restore validates descriptor/kind/contract/placement identities, state, memory, route state,
arming identities and request correlations. It rebinds valid recovery deliveries to the new
incarnation using durable records; an old Runtime's producer never acquires authority over it.
Neither initial nor start runs. Fragment/seed/schema changes require compatible shape/version
handling, never a silent partial reset. SSR activation likewise never invokes a commit.

A timer firing carries both activation and **arming** identity. Restart invalidates a queued
firing for its previous arming; changing memory alone does not make that old firing current.
Equal deadlines and Runtime-clock semantics remain Machines O5. restartOn has a silent baseline
and stays idle on entry. It is compared against the final committed state once per actor turn.
If an editing state is entered by the very edit intended to trigger debounce, its initialized
counter is the baseline, not a change: that timer does **not** arm. Use a scope that was already
active before Edit, or an ordinary entry-armed Duration for an initial dirty phase. Static check
can warn about the pattern; it cannot prove opaque selectors express “dirty”.

For autosave, wire only user onEdited to a debounce that already lives with the editable draft.
Server Replace emits nothing. If edits happen during flight, coalesce them with an explicit
pending-edit/due flag and submitted revision, then issue one trailing save after the reply.
Do not re-enter a restartOn scope and assume its baseline fires. Unknown/interrupt/defect stops
fresh saves until reconciliation. Miswiring a server value to Edit remains possible; it is
visible to tools, not magically forbidden by naming.

## 5. Testing alone without private-result injection

`story.fragment` generates an ordinary host and then uses production story.machine. Its options
reuse input, props, operations, services and fixtures. Trait input is required exactly as its
contract requires; subroutine input is supplied by the static `.call(input)` command. `.leave()`
is the generated host's public Leave event. Fragment-public sends expand to that host's public
route, never a private-result injection or permission to send bare fragment envelopes elsewhere.

**One binding form:** production and Stories use
`({ O, reply }) => ({ actions: [O.x.commit/refetch(...)], abandoned? })` in props. The helper
supplies the generated host's O from its operations declaration. For commit requests it supplies
the same non-targeting abandoned observer when the test omits one, recording Pending and terminal
facts. If the test supplies an observer, it runs as a normal production binding and evidence is
still recorded. There is no requests/operation/select shortcut. Parameter selectors stay
payload-only. Services/fixtures are ordinary fresh Effect Layers; results come from real finite
operations. Notifications get real recording bindings unless the test supplies its own.

Live values and guards bind in props with the same selectors as production. They are construction
configuration, not arbitrary per-step Story commands. To test refusal, bind a denying guard;
to test changing provider state use the existing focused Story context/service mechanisms.
The supplied fragment-local props selector context is the generated host's captured context,
not direct mutable access to the fragment's private memory.

Captured `.fragment` is a plain local snapshot or undefined when inactive. `.result` is the
last captured `{ name, payload }` return or null; `.calls` and `.abandoned` record notification
and recovery evidence. They are projections from the ordinary generated host, not an alternative
execution engine. Private hostEvents need a real parent-adapter integration test. The harness
permits re-entry with old work pending to exercise fencing; application submission policy is
still tested in the actual host.

```ts
// pieces.test.ts
import assert from "node:assert/strict";
import { deny } from "flow-state";
import { story } from "flow-state/testing";
import { Debounce, RequiredField, CommitWithRetry, SaveTitle } from "./pieces";

const quiet = await story.fragment(Debounce, {
  id: "debounce-alone",
  props: { waitMs: () => 300 },
})
  .send(Debounce.E.Input()).process()
  .advance("200 millis").process()
  .send(Debounce.E.Input()).process()
  .advance("299 millis").process().checkpoint("before")
  .advance("1 millis").process().checkpoint("after")
  .run();
assert.equal(quiet.checkpoints.before.calls.onSettled.length, 0);
assert.equal(quiet.checkpoints.after.calls.onSettled.length, 1);

const locked = await story.fragment(RequiredField, {
  id: "field-refuses-alone",
  input: { value: "seed" },
  props: { canEdit: () => deny("Locked") },
})
  .send(RequiredField.E.Edit({ value: "after" })).process()
  .run();
assert.equal(locked.end.fragment?.memory.value, "seed");
assert.equal(locked.end.fragment?.memory.edits, 0);

const retryBase = story.fragment(CommitWithRetry, {
  id: "retry-alone",
  operations: { save: SaveTitle },
  props: {
    onSend: ({ O, reply }) => ({
      actions: [O.save.commit(({ payload }) => payload.request, {
        outcomes: {
          success: reply.Succeeded.from((receipt) => ({ receipt })),
          failure: {
            Busy: reply.Busy,
            Rejected: reply.Rejected.from((e) => ({ reason: e.reason })),
          },
        },
      })],
    }),
  },
});

const exhausted = await retryBase
  .call({ request: { ticketId: "T1", title: "busy", revision: 0 } }).process()
  .advance("20 millis").process()
  .advance("2 seconds").process()
  .advance("20 millis").process()
  .advance("2 seconds").process()
  .advance("20 millis").process()
  .run();
assert.equal(exhausted.end.result?.name, "GaveUp");

const reentered = await retryBase
  .call({ request: { ticketId: "T1", title: "old", revision: 0 } }).process()
  .leave().process()
  .call({ request: { ticketId: "T1", title: "new", revision: 1 } }).process()
  .advance("20 millis").process().checkpoint("oldFinished")
  .advance("20 millis").process().checkpoint("newFinished")
  .run();
assert.equal(reentered.checkpoints.oldFinished.fragment?.state, "SENDING");
assert.equal(reentered.checkpoints.oldFinished.abandoned.length, 2);
assert.equal(reentered.checkpoints.newFinished.result?.name, "Done");
```

The two recovery records are Pending at departure and Success after settlement. Serialize keeps
the new operation queued until the old one settles, followed by its own fresh 20 ms delay.
The old result cannot finish the new invocation. A held fixture leaves pending visible and
Leave still works. Required guards remain required; required notification recording is an
explicit helper-supplied production binding, not an implicit production no-op.

Acceptance proofs cover five groups: fused guard/check parity and no consumed-delivery decline;
first-send/captured retries/all outcomes/admission; abandonment and same-Attempt reconciliation;
restore and timer/autosave races; draft policy, nested private/public authority and packed types.
These are still executable-proof obligations for an implementation, not tests run by this file.

## 6. Problem table, through round 2

“Prevents” means the **proposed** types/construction/flow check rules exclude that structural
mistake; none is claimed implemented. “By convention” means the example is safe but a compiler
cannot prove the semantic obligation. “Allows” is an explicit permitted trade-off. Arbitrary
application callback defects retain the Plans' issue/no-retry behaviour and can prevent progress.

| Problem | Verdict | Enforced boundary or limitation |
| --- | --- | --- |
| L1 stale timers | Allows | Activation/arming identities fence dead timers, but an author may choose an actor-lifetime trait when a narrower scope was intended. |
| L2 late results | Prevents | Activation/request identity checks reject obsolete normal replies; abandoned commits follow a distinct recovery route. |
| L3 leftover memory | Prevents | Only explicit calls enter steps and each initializes fresh slices; restore continues the saved invocation. |
| L4 no way out | Prevents | An owner transition may always leave a step, including an exitless poll or blocked request. |
| E1 broken invariants | By convention | Handler/memory privacy and declared guards are enforced, but business invariants and correct public/host-only classification still belong to the author. |
| E2 interfaces growing with depth | Allows | Public descendant paths and documented snapshot data are deliberate compatibility dependencies; private behaviour remains inaccessible. |
| E3 hidden endings | Prevents | Subroutine callbacks cannot leave their mount; normal exits and owner abandonment are explicit, and trait callback targets stay inside their lifetime scope. |
| H1 bypassed policy | Allows | A fragment may declare a public mutation input; use hostEvents when policy requires host mediation. |
| H2 unforeseen checks | Allows | A host must revise the declared policy contract or own the behaviour rather than inject a private-event veto. |
| H3 faked results | Prevents | Replies are branded to one operation binding/outcome class; exits have no send/raise constructor. |
| D1 drifting copies | Allows | Direct reads remove the need for mirrors but arbitrary host code may still copy data incorrectly. |
| D2 reading live values too late | By convention | Types prevent a host select reading live fields and CommitWithRetry retains its confirmed input, but an author could write another fragment that emits changed payloads on retry. |
| D3 feedback loops | By convention | Edit/Replace and total revision checks make the sample safe, but arbitrary host code can still label a server update Edit. |
| D4 unmapped outcomes | Prevents | Host success/failure coverage plus generated standard replies, total reply paths and cancellation/projection closure cover every actual outcome. |
| A1 compounding forwarding | Prevents | Public descendant events join the actor interface automatically; no ancestor re-declares leaf inputs. |
| A2 unrelated blocks | Prevents | Every binding's props, owner-event adapters and return mappings share its placement path. |
| A3 conditional placement rules | Prevents | Constructor fields and placement kinds are distinct; no stateless fragment can be arbitrarily mounted or embedded. |
| A4 overloaded words | Prevents | Events means public everywhere; answers declares shapes, reply produces, replies handles; the ledger records extended roles. |
| A5 I/O inside fragments | Prevents | Fragment descriptors cannot declare operations or Effect actions; only root bindings connect request props to actual operations. |
| A6 silence discovered late | By convention | Required omissions reject and optional omissions are reported, but semantic dependence on an optional notification cannot be proven. |
| E4 refusal by forwarding | By convention | Public input routes have no vetoing intermediary; declaring an invariant-carrying Release hostEvents would still be an author contract error. |
| L5 abandoned effects | By convention | One durable observer receives Pending/terminal facts so recovery is not lost, but fresh-submission gating is application policy shown in RenameHost. |
| L6 silent admission | Prevents | Required requests forbid reject concurrency and close pre-invocation cancel with the generated interrupt reply. |
| H4 misrouted/mislabelled results | Prevents | Lexical path/class brands and automatic standard-outcome routing reject foreign replies and unknown-to-Busy mappings. |
| D5 restore in flight | Prevents | Persisted request/route identity is validated, commits recover unknown/interrupt and pending reads recover interrupt without request replay. |
| D6 same-turn seeding | By convention | Explicit call arguments can read event/exit payload directly, but a mapper choosing pre-turn memory still cannot observe the same transition's patch. |
| D7 drafts lost on abnormal endings | Allows | Back/Leave preserve the sample draft, while Restart intentionally discards; other owners may omit preservation. |
| T1 partial turns | Prevents | Any denied/unhandled raise declines its source candidate, check uses the same composed guards, and consumed-delivery chains are structurally total. |
| T2 schedule traps | By convention | Arming identity fences obsolete firings, but avoiding an entry-idle restartOn baseline is an authoring rule plus a heuristic warning. |
| A7 forgotten first send | By convention | Every call has a start transition and complete bindings, but whether a request must issue immediately is a behavioural requirement proved by the first-send test. |
| L7 departure gap | By convention | Synchronous Pending observation is enforced, and RenameHost blocks Submit from that publication, but arbitrary observers/guards can still ignore the obligation. |
| H5 interrupt as not-sent | By convention | Commit interrupt always carries Attempt and the example enters UNCERTAIN; the API cannot prove an author's local handler never chooses an unsafe fresh retry. |
| E5 late observer preempts workflow | Prevents | The observer type/construction checks exclude targets, calls, raises and callbacks; ordinary declared finite-action consequences remain explicit host policy. |
| L8 reply to an unadmitted/wrong call | Prevents | Request ids/waits become visible only with validated admission, duplicate admission yields no reply, and every delivery checks the exact admitted id across cancellation/restore. |

There were 20 original IDs despite the yardstick saying 21. Round 1 added ten; round 2 adds
L7, H5, E5 and L8: **34 distinct rows**. The yardstick and review files remain unchanged.

## 7. Static analysis and graphs

Tools read complete constructed declarations, retaining owner, kind, path and source location.
Construction builders run once to create those values; check/graph do not re-run application
behaviour to discover edges. Loading trusted user modules retains CommandLine's existing caveat.
No claimed static rule depends on deciding the result of an arbitrary TS predicate.

### Structural checks

**flow check mirrors R1–R16's type/construction errors for untyped declarations**, using the
same paths, producer classes, branded origins, contract completeness and payload/target rules.
The following deeper graph checks name concrete cases beyond a TS property error:

| Rule | Concrete graph check |
| --- | --- |
| R6/R15 | Find recursive containment/start chains and automatic raise/callback/return cycles; timer/operation boundaries break cycles. |
| R8/R10 | Find incompatible non-self targets, overlapping owner/key patches (including Pending plus Leave), raises into new/leaving activations and exits with no exhaustive owner mapping. |
| R9 | Follow replies, exit continuations and live timer firings through notification/raise chains; reject any path with no complete unguarded alternative, even through several host bindings. |
| R11 | Match the one finite action to its kind and brand; exhaust success/failure tags, forbid host remapping of standard outcomes, reject missing bindings or illegal delegation. |
| R12 | Reject two issues of one port in a fused candidate; require total reply coverage in reachable pending states; retain runtime admission/identity validation for later-event overlap. |
| R13 | Follow every owner/ancestor exit, explicit re-entry and relay to a surviving abandoned observer; reject missing, targeting, raising or callback-producing observers. |
| R14 | Validate saved fragment/kind/state/Schema/route/request/arming correlations; reject capture mixtures that revive a consumed recovery route or silently resume a dead finite read. |
| R2/R16 | Keep existing names/path bounds, activity dependency checks, operation identities, domain/wiring rules and complete type-fact requirements, with source paths retained after expansion. |

These are structural over-approximations, not proofs of opaque predicates. An untyped callback
reading an unavailable property receives only the narrow runtime context and fails admission;
tools cannot prove arbitrary closure reads are pure. Decoded-type compatibility plus boundary
validation is not an algorithm for equivalence of arbitrary Schema refinements. Possible invalid
automatic paths are rejected conservatively rather than assumed impossible by a guard.

### Heuristics and information, not proofs

| Finding | Actionable meaning |
| --- | --- |
| Unbound optional callback | List its path before execution; calls retain an unbound marker. |
| Required request has no timeout | Adapter nontermination can block progress; add explicit timeout or explain owner lifetime. |
| Exitless step has no owner departure | Poll has no public route out; add Close if continuous actor lifetime is unintended. |
| Recovery data ignored / submit ungated | Route presence is valid, but a destructive workflow may issue a fresh command before reconciling; review the application guard. |
| restartOn baseline trap | Entering an apparently dirty scope creates a silent baseline; use an existing editing scope or an entry-armed timer. |
| Likely user/server feedback edge | A known server outcome feeds Edit rather than Replace; data provenance inside arbitrary mappers remains unproven. |
| Snapshot mirror / public path coupling | Prefer direct reading or acknowledge a documented compatibility dependency. |
| Existing warnings | Unreachable/stuck leaves, unhandled events, sends/cycles, service duplication, sensitive data, lazy loading and domain rules remain. |

### Graph and explanation

flow graph collapses/expands ownership boundaries and shows one active-leaf tree. Edges distinguish
public inputs, host-only raises, calls with argument Schemas, start continuations, notifications,
requests/operations/replies, returns, schedules, abandonment and non-targeting recovery. There
are no READY/Begin artifacts. Root trait timers are visible beside the leaf tree.

SAVE expands to SENDING ↔ BACKOFF plus terminal replies and abandoned routes. The confirmed
RenameRequest travels on the call and every retry's request port. The same-Attempt retry route
is distinct from a new commit edge. Checkout has one public field path, with no forwarding
edges to repeat. Static explain shows possible guards/fallthrough/returns without running them;
check evaluates the supplied event as specified above. Recorded explain adds actual request,
activation/arming ids, source paths, outcomes, discarded stale reads and preserved recovery
obligations. Existing redaction and truncation/insufficient-evidence semantics remain intact.

## 8. What changes against prior proposals and Plans

| Area | Final proposal versus proposal.md / fragments.md |
| --- | --- |
| Split | Retains D12–D13 for lifetime/control flow, not implementation state count. |
| Initialization | Both kinds use Schema input; trait seeds are definition-side, subroutine seeds are explicit call arguments; props are live-only. |
| Inputs | Replaces D11/manual forwarding and round-0 exposes with fragment-declared events/hostEvents/internalEvents. |
| First send | Replaces duplicated host-first-send and round-0 Begin/READY with one explicit call's start transition. |
| Endings | Keeps declared exits; permits abandonment; trait callbacks may target within their containing lifetime, step callbacks may not leave the mount. |
| Async | Required kinded request props, branded lexical reply producers, host success/failure adaptation and generated standard-outcome delivery. |
| Late effects | Complete durable non-targeting abandoned routes, including synchronous Pending observation; pending finite reads restore interrupt. |
| Turns | Fused pre-turn reads and whole-candidate decline, not round-0 staged memory or partial raised-command success. |
| Tests | Generated story.fragment hosts with real fixture-backed operation delivery; no private reply injection. |

### Simplification, standardisation and cohesiveness

The constructor fixes lifetime. Input fixes initialization. events/hostEvents/internalEvents
fix producer authority in the fragment itself. A placement fixes binding location. A request
kind fixes standard outcome handling. A call fixes arguments and first work in one visible
transition. Full code no longer needs per-level exports, startup-only states, repeated standard
outcome maps or a hand-written test host for each reusable piece.

The price is explicit: start is a new **transition** form; a callback's target range follows
its kind's own node; request recovery is a real protocol rather than a generic optional callback. This proposal favors mechanically checkable boundaries over a smaller but
misleading vocabulary.

### Plan amendments and costs

| Owner | Amendment | Cost |
| --- | --- | --- |
| Machines O1/O2/O8 | Placements, definition-side trait seeds, hostEvents, nested public Event union, call/start, implied empty event/exit records, and host activity paths such as activities.LIVE.queue | Compiler/type/schema work; explicit snapshot shape extension; ordinary activity paths stay flat. |
| Machines O3 / Runtime O4 | Fuse raises/callbacks/returns; Pending joins departure and later abandoned facts are non-targeting actor turns with validated memory patches and finite actions | Conflict/ordering analysis and a new internal turn source; no out-of-turn host-memory mutation. |
| Machines O5 | Schedule value callbacks may read declared live props alongside existing captured inputs | Definition-only initialization is unchanged; changing a live prop does not retime an already-armed schedule. |
| Machines O4 / React O4 | check runs composed guards and guard-dependent payload mappings only | Smaller than reducer simulation but still adds pure mapper defect sites/cost in views; update/action/initial callbacks remain excluded. |
| Operations O2/O3/O7 / Machines O6 | Kinded complete request delivery, payload-only selects, no reject, cancellation/projection closure, and the abandoned observer as a new late fact delivery path | Request-only amendments to silent cancellation and finite-event delivery; cache consequences retain their owner. |
| Runtime/Persistence/SSR | Persist invocation/request/arming identity, recovery route obligations; pending read → interrupt; no call/start replay | Durable recovery and compatibility proofs; no remote rollback guarantee. |
| Testing O1/O3/O5 | Generated fragment Story hosts; calls/leaves are generated public host events, requests use real operations and Layer fixtures | Test DSL members and evidence projection, without raw outcome injection or mutable harnesses. |
| Inspection/CommandLine | New owned edges/checks and recovery evidence | Source mapping/type facts; completeness markers remain honest. |
| Package | Root composition names and testing-only Story members | Packed declarations/consumer proofs; six routes stay intact and removed actor final/onDone/output stay removed. |

### Weaknesses and acceptance bar

1. Static rules and syntax have not been implemented/typechecked as an API; a pinned TS/Effect spike
   must prove initialization, inference, fused check parity and durable recovery before acceptance.
2. Public paths couple clients to descendant structure; swapping internals must preserve the
   public command/snapshot contract. Inputs cannot be hidden by an unexpected ancestor policy.
3. No static rule proves business idempotence, Busy's meaning, an adapter eventually settling,
   draft preservation policy or correct fresh-submission gating after abandonment.
4. Fused rules reject useful but complicated patterns: new-scope raises, guarded start,
   overlapping projections and same-turn loops even if a programmer knows them bounded.
5. Call/start, kinded requests and durable non-targeting recovery cost more than two constructors;
   small one-off behaviour may be clearer as ordinary host states and operations.

## Possible cuts

**None of these feature cuts is applied.** The user decides. The first table preserves the
ranking in round2-simplicity §6(b), with the corrected losses from correctness §8.6. The second
covers the additional cross-proposal choices from §7, corrected by correctness §8.7.

| Rank | Proposed cut | What simplifies | Use cases that break / corrected losses |
| --- | --- | --- | --- |
| 1 | Remove payload-mapper evaluation from check | Removes part of the Machines O4 extension and mapper defects/cost in render | A child guard on a transformed raised payload stops working. Merely skipping the mapper reopens **T1** via check/handling disagreement; preserving correctness requires forbidding transformed payloads into guarded commands. |
| 2 | Make start actions-only, rather than a transition | Removes start targets and nested call selection at startup | CheckoutWizard cannot directly call its first input-bearing AddressStep; needs extra host assembly/dummy control state. Reopens **A7 for composites**, and loses the explicit initial call edge. |
| 3 | Remove per-arming/per-request identity | Shrinks timer/request metadata, persistence and delivery validation | Queued old timers may fire replacements, old/cancelled occurrences may finish newer requests, and restore loses exact correlation: **L1, L2, L8, D5**, not merely narrow timing races. |
| 4 | Remove the abandoned protocol | Removes the observer, synchronous departure observation and durable routes | Navigating away during a write loses Pending/late facts: **L5, L7, D4 partly, D5**; a targeting replacement also reopens **E5**. The one-observer no-loss change already removes the repetitive surface. |
| 5 | Remove request kinds and branded producers | Removes class/path checks and generated standard-outcome division | Safe success/failure adaptation and uncertain-write handling become manual: **H3, H4, D4, L6, H5**. Interrupt may again be mislabeled not-sent; unrelated operations may satisfy a waiting fragment. |
| 6 | Remove fused composition/whole-candidate decline | Removes guard expansion, conflict/DAG/totality analysis and composed check | Atomic Reset-all-fields, host-fed debounce and silent Replace-after-save lose their common path; moving to later independent turns reopens **T1, D3, H1, A1**. |

Additional cross-proposal cuts retain that audit's ranks. Rank 7 (raise/composition) is already
covered by proposal-specific rank 6 above. None is silently included in a no-loss drop.

| Cross rank | Proposed cut | What simplifies | Use cases that break / corrected losses |
| --- | --- | --- | --- |
| 1 | Remove finite read requests; leave reads as host activities/refetch events | Removes read-kind result ownership and read-restore protocol | Poll/verify steps cannot own their refresh reply. Reopens **D4/L2 for reads, D5**, and **H3/H4 for read results**, since host mappings can fabricate Ready/Verified. |
| 2 | Remove live value props; keep fixed input only | Removes current-value selectors/validation and their schedule arguments | Changing pagination limits, current server facts and live debounce configuration require pushed copies; reopens **D1**. Removing live props together with payload-only read selects also makes changing keys dependent on timely copied host commands. |
| 3 | Forbid subroutines inside fragments, retaining traits inside steps | Removes nested calls, relay routing, nested request lifetimes and recovery | CheckoutWizard → AddressStep reuse becomes host assembly; loses prior D1 composition closure and reopens **A1** in composites. It also removes L5-at-depth and relay correctness surface, which is a real implementation saving. |
| 4 | Remove start; host sends the first request | Removes first-work ownership and the new-scope startup read rule | A reusable request step no longer starts itself; two owners select/issue the command. Reopens **A7, D2, L8**, because one-outstanding admission/correlation now spans host and fragment. |
| 5 | Forbid leaving while a commit is pending, perhaps except after cancel | Reduces ordinary abandonment paths | Navigation/log-out cannot always leave; a hung adapter reopens **L4 fully**, not partly. Post-invocation cancel still produces Unknown after departure, so it **does not remove the recovery protocol**. A strict wait policy removes L7 but changes product semantics. |
| 6 | Forbid trait callback targets | Shrinks callback target range/checks | Idle timeout → LOCKED and trait hold → DELETING need a step/wrapper. Coverage loss rather than a new original yardstick failure; fewer departure paths mildly reduce L5 exposure. |
| 8 | Remove request ports entirely; host maps outcomes to hostEvents | Removes much of the protocol surface and many Plan amendments | Fragment-owned retries, fenced complete results and first sends become handwritten host wiring: **D2, D4, H3, H4, L2, L5, L6, D5, A7**, plus **H5, L7, L8**. |

## Sources and validation

Authority: [Machines](../../../../Machines.plan), [Operations](../../../../Operations.plan),
[Testing](../../../../Testing.plan), [CommandLine](../../../../CommandLine.plan),
[FlowState](../../../../FlowState.plan), [Package](../../../../Package.plan),
[design principles](../../../design/principles.md), [minimal library](../../../design/minimal-library.md).
Prior art: [yardstick](../principles.md), [split draft](../proposal.md),
[single draft](../../fragments.md), [examples](../../fragment-examples.md),
[syntax history](../../fragment-contract-syntax.md).
Round 1 reviews: [correctness](reviews/round1-correctness.md), [principles](reviews/round1-principles.md).
Round 2 reviews: [correctness/audit check](reviews/round2-correctness.md),
[principles](reviews/round2-principles.md), [simplicity](reviews/round2-simplicity.md).
Borrowing is credited at the corresponding rules; no other proposal or review file is modified.

Validation is document/source-syntax only, not proof this nonexistent API typechecks or runs.
All eight complete module/test blocks and the outcome type pass the installed Babel TypeScript/JSX
parser; the signature-notation block is excluded. Checks pass for six host/component sets,
all 34 distinct problem rows, local links, balanced fences, whitespace, the single tagged
observer with Pending, the 16-rule sequence, uniform request-binding syntax, omitted empty
declarations and absence of props in initializers. `git diff --no-index --check /dev/null
<this-file>` passes. Only this
proposal was edited. No build, runtime proof, task-state mutation or commit is claimed.

## Revision log (round 1)

Historical record of round 1; the round 2 log below supersedes changed surface details.

### Correctness review §8

| Finding | Resolution |
| --- | --- |
| B1 / must-fix 1: abandoned in-flight commit | Added complete non-targeting abandoned routes and a flow check error for every unowned owner/ancestor leave path; synchronous Pending observation closes the response gap; RenameHost blocks Submit and reconciles the same Attempt. L5 remains by convention because a route cannot prove product gating. |
| M1 / must-fix 2: pending read restore | Every saved pending finite read receives interrupt before public input admission; Poll handles it by entering WAITING. |
| M2 / must-fix 3: machine-bound props in initial | Removed props from initial; RequiredField requires definition-side input; trait seeds use only admitted owner input/own initial memory. |
| M3 / must-fix 4: partial raised commands | Raises now decline their whole candidate; Replace is guarded apply plus unguarded no-op, as the principles review recommends. Rejected a separate optional-raise API because the total command expresses this failure case locally without an escape hatch. |
| m1: “Not invoked” interrupt | Commit interruption retains Attempt and enters UNCERTAIN with “may have run”; no fresh retry based on that label. |
| m2: activities.LIVE.queue | Kept and explicitly listed the Machines O1/O2/O8 snapshot-shape amendment. |
| m3: globally reachable replies | Replaced global producers with lexical reply plus per-path/outcome-class brands and construction origin checks; scope alone is explicitly insufficient. |
| m4: H1 overclaim | Changed to allows by declared public contract; hostEvents has enforced private admission. |
| m5: call mapper snapshot | Stated pre-turn event/payload/memory semantics beside call and in the rules; D6 is by convention for authors choosing a stale memory source. |
| m6: dead-ended uncertainty | Added full Reconcile event, same-Attempt retry action, exhaustive outcomes, RECONCILING handling and component control. |

### Principles review §7

| Finding | Resolution |
| --- | --- |
| 1 / must-fix 1: declined raises and Replace | Whole-candidate decline and total Replace; reply/return paths require structurally total raises. |
| 2 / must-fix 1: reducer dry-run | Removed staged snapshots and reducer simulation; check never executes memory updates, initializers or action selectors. Rejected literally mapper-free check: a child guard on a transformed payload cannot be evaluated without that pure payload mapping. This smaller O4 amendment is explicit. |
| 3 / must-fix 2: start event and READY | Removed both and Poll's phantom initial timer; start is a transition with target plus request actions. Adapted, rather than literally copied, start:[actions] because a nested wizard also needs to select/call its first child without a default subroutine or dummy leaf. |
| 4 / must-fix 3: abandoned unknown | Added required pending and all terminal routes, rather than unknown alone, so a late success or queued cancellation also retains a recovery obligation. |
| 5 / must-fix 4: trait callback cannot navigate | Trait callbacks now may target inside their containing lifetime scope; DebounceHost demonstrates OPEN → LOCKED. A trait still cannot return from a containing subroutine. |
| 6 / must-fix 5: repetitive outcomes | Added request kinds; host maps success/its failure tags, fragment handles automatic unknown/interrupt/defect. Retained outcome-class enforcement. |
| 7: overloaded events and repeated exposes | Adopted opus-split's events/hostEvents/internalEvents producer sets; removed exposes entirely. |
| 8 / must-fix 5: hand-written test host | Added generated story.fragment with real descriptor/Layer-backed requests and ordinary generated public call/leave events; removed RetryHarness duplication. |
| 9: replies used twice | reply is lexical producers; replies is local handlers. |
| 10: call mapper stale-read trap | Explicit pre-turn rule and direct payload examples; no promise that a same-turn memory patch is visible. |
| 11: duplicated call mapper | Shared callAddress/callWizard descriptors are reused at their owning scope. |
| 12: activity snapshot path | Explicit amendment, not a claim of existing flat-path semantics. |
| 13: allow-when-unbound guard | Rejected: omitted permission must remain a local construction error, not a silent authorization grant; the few () => true bindings make intent explicit. |
| 14: opaque vocabulary | Rewrote rules in terms of events, guards, patches, turns and operation bindings; request/activation ids remain only where they explain fencing or recovery. |

### Cross-proposal ideas, shared gaps and expanded yardstick

Borrowed the public/host-only producer split and outcome-kind division from opus-split;
whole-candidate decline and total replacement from opus-single/sonnet-split plus the reviewers;
abandoned routing and read-restore interrupt from codex-single; real fixture-backed generated
harness direction from sonnet-single. Kept the split, explicit call arguments, payload-only
selects, no reject, projection closure, one pending request per prop and timer arming identity.

Added every suggested yardstick ID: E4, L5, L6, H4, D5, D6, D7, T1, T2 and A7. All original and
new “prevents” verdicts now name an enforceable structural rule; semantic decisions are labelled
by convention/allows. Back returns drafts and owner Leave preserves them, while Restart is
explicit discard. Documented restartOn's entry baseline and trailing-autosave rule. Pending
read/commit recovery, same-turn argument sources, default admission and late writes all have
explicit rules and Plan costs. No review finding is silently treated as an accepted Plan change.

Kept a separate replies handler block despite the cross-proposal novelty objection: it marks
operation payload handlers and exhaustive standard replies without exposing event constructors.
Putting reply tokens in on would require a new computed-key/producer protocol there instead.
Also rejected proving future pending-port admission from opaque memory guards: only duplicate
issues in one fused candidate are structural errors; later-event overlap is a warning plus
runtime batch validation. D2 is narrowed to by convention for arbitrary fragment implementations,
while the host's payload-only selector restriction remains an enforced type boundary.


## Revision log (round 2)

### Findings addressed

| Review finding | Change or explicit decision |
| --- | --- |
| Correctness §6 m1: Pending/source patch conflict | Kept atomic merge and documented the owner/key conflict locally (R8/R13, §4.5); the example puts departure error text in Pending. Rejected implicit ordering/second publication because it hides overwrites. |
| Correctness §6 m2: definitive failure left unresolved | The observer's Failure case clears unresolved for this adapter's definitive Busy/Rejected errors. No clearing-via-retry after reload; unknown/interrupt/defect retain Attempt. Durable consumption is captured consistently so a closed old failure is not revived. |
| Correctness §6 m3: staged call arguments | Kept pre-turn reads, with the existing direct event/exit-payload route. D6 remains by convention. Rejecting a staged exception preserves Machines O3 and avoids a second read model; it was advice, not a required drop. |
| Correctness §6 m4: schedule callback props | Added an explicit Machines O5 amendment for declared live props in schedule value callbacks; arming semantics are unchanged. |
| Principles §6 must-fix 1: isolated guards/props/trait input | story.fragment accepts Schema input and production props; RequiredField alone is seeded and bound to a refusing guard, and Debounce alone binds a live wait prop. |
| Principles §6 must-fix 2: two request-binding forms | Removed test requests/operation/select. Both contexts use props builders receiving O/reply and returning actions plus abandoned; the helper supplies a recording observer if omitted. |
| Principles §6 must-fix 3: missing late-fact amendments | Listed abandoned facts as internal host turns under Machines O3/Runtime O4 and Operations delivery, including atomic memory patches and finite actions. |
| Principles §6 must-fix 4: vocabulary/rule sprawl | One 16-group numbered rules list; type-mirroring checks collapsed to one line with only deeper graph checks retained. Ledger counts every new API role and separately lists all outcome tags. |
| Principles §6 must-fix 5: empty declarations | Implied no-work stateless start and empty event/exit records; full examples omit them. Constructor remains the kind authority. |
| Principles minors: overloaded replies and duplicate directional names | answers declares, reply produces, replies handles. Address Back returns Returned; a Rejected reply returns Refused. Dropped the qualifier on raise. |
| Principles shared gap: consumed timer notification may decline | R9 now covers replies, exit continuations and live timer deliveries, including all nested notifications/raises; proof is transitive, not just the direct handler. |
| Principles shared gap: outcome mapper throws | Retained automatic defect closure with Attempt/issue, no second mapper; added it explicitly to the acceptance proofs and graph explanations. |
| New yardstick | Added L7, H5, E5 and L8, for 34 rows. L7/H5 are by convention beyond the enforced capture/class boundaries; E5/L8 name the structural rules that prevent the mistake. |

### Confirmed no-loss drops applied

| Correctness audit verdict | Applied change and preserved condition |
| --- | --- |
| §8.6 one request-binding form: keeps | Production form everywhere; generated Story supplies abandoned evidence. |
| §8.6 one abandoned observer: keeps only if | One tagged outcome includes Pending, synchronous in the departure turn; no target/call/raise/callback. |
| §8.6 implied stateless start: keeps | Omit only the no-work self start; startup request actions remain available. |
| §8.6 implied empty records: keeps | Omitted events/exits mean none; explicit trait/subroutine constructors still fix placement/lifetime. |
| §8.6 contract replies rename: keeps | Contract answers is distinct from local replies and lexical reply. |
| §8.6 one terminal-totality rule: keeps only if | R9 covers complete reply/exit/timer chains and all reachable notifications/raises. |
| §8.6 one own-node callback rule: keeps | R1 defines the node; R10 never leaves it. A trait's containing node still permits idle → LOCKED. |
| §8.6 drop qualifier on raise: keeps | No optional raise exists; a total command expresses accepted no-op behaviour. |
| §8.7 raise only into hostEvents: keeps only if | Public events retain direct routing; Reset uses private SetDraft with user-edit semantics. No public feature is removed. |
| §8.7 one optional form: keeps only if | .optional remains values/notifications only; guards never silently allow. |
| §8.7 type-mirroring consolidation: keeps | One rule/check statement retains construction enforcement for untyped callers; concrete deeper graph checks remain. |
| §8.7 one story entry / explicit constructors: keeps | Already present and retained; no trait/subroutine test fork or inferred-kind rule is added. |

**Counts after the drops:** 37 framework entries: 31 API roles (6 constructors, 15 composition
members, 2 kind values, 1 diagnostic code, 7 testing roles) plus 6 tagged outcome cases;
approximately **55 semantic obligations organized into 16 numbered rule groups**. The prior
~36 keywords/~60 scattered rules were audit estimates. These explicit
inventories count roles/groups consistently and do not pretend all grouped obligations vanished.

### Rejections and cuts left to the user

No feature cut was applied. Possible cuts lists all six proposal-specific ranked cuts and the
additional cross-proposal choices, including understated T1/check parity, L8/D5 identity,
L7/E5/durable recovery, H5 kind semantics, and hung-adapter L4 losses. Kept transformed guarded
payloads/check mapping, nested start transitions, read requests, live props, identity fences,
recovery, request kinds/brands and fused composition pending user decisions. Retained required
guards and no optional raise. These preserve the previously accepted correctness advice rather
than trading it away to improve counts.
