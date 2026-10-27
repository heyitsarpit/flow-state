# Split proposal: `trait()` and `subroutine()`, rebuilt (revision 2)

Status: exploration proposal, not part of version 1. Evaluated against [../principles.md](../principles.md)
plus the yardstick additions of rounds 1 and 2 (E4, E5, L5 to L8, H4, H5, D5 to D7, T1, T2). All syntax is
draft. Where this file and a plan differ, the plan wins; section 6 lists the plan changes this proposal
needs. Changes are listed in the two revision logs at the end.

## 1. Verdict (short)

**Keep two constructors.** They differ in what a type can enforce and a reader cannot guess: a trait has no
state and lives with the host; a subroutine is a state node, starts fresh, ends through exits, and fences
late replies. One constructor would need the conditional rules A3 forbids (both reviews: every single-fragment
proposal ends with this placement rule). The split does **not** earn its cost on the contract grammar, which
is one block shared by both kinds. Cost of the shape: two constructors to learn, and a trait cannot hold a
subroutine. "Trait" means Scala's stateful trait, not a TypeScript interface.

| Prior decision | Verdict | Reason |
| --- | --- | --- |
| D1 nesting, D3 depth | keep | No limit beyond the ten-segment state path limit. A trait cannot contain a subroutine. |
| D2 nested names visible | split | Reads open; events addressed at their path; nested children's events reachable only by their parent. |
| D4 callbacks | keep, extend | `request` props for operations. |
| D5/D7 exits only | keep | Callbacks in a subroutine never target. |
| D6 fragment owns contract | keep | One `contract` block. |
| D9 hiding | keep | Nested events and writes hidden; reads open. |
| D10 guard props | keep, rename | Constructor `gate()` (A4); no optional gates. |
| D11 only host sends | replace (opus-split) | `events` (anyone, at the fragment's path) and `hostEvents` (placer only). |
| `raise` | drop | `also`: same-turn composition. |

## 2. The API

### 2.1 The shape of a fragment

```ts
trait({ id, contract: { input?, events?, hostEvents?, props? }, embeds?, memory?, initial?, internalEvents? }, build)
subroutine({ id, contract: { input?, events?, hostEvents?, props?, exits? }, states?, embeds?, memory?, initial?, internalEvents? }, build)
```

The first argument is structure; `build({ S, E, P, exits })` returns behaviour. `P` holds the **tokens** of
callbacks, requests and gates for use inside the fragment (`P.send`, `P.canEdit`); `({ props })` inside a
callback holds the **values**. Tokens exist at construction, values per turn, as `S`/`E`/`O` against
`state`/`memory`. `contract` is kept (not optional) because it groups the whole outside surface (A2).

**Events.** `events` are sendable by anyone at the fragment's path (`checkout.send(Checkout.E.ADDRESS.Next())`),
readable at the same path (`memory.ADDRESS`). `hostEvents` are sendable only by the placer through `also`. A
fragment nested in another is reachable only by its parent: its events never appear in the outer `E`. The
author decides per event: _must every sender reach it directly (Release), or must the placer act first (a
debounce Input after the host's own update)?_ Rule: at the host, `also` targets only `hostEvents` of placed
fragments (a public event already arrives directly); inside a wrapping fragment, `also` targets any event of
its direct children.

**Props.** Four kinds, all Schema-shaped. Every port is required; to ignore a callback, write `{}`.

| Kind | Declares | Host supplies |
| --- | --- | --- |
| `prop(Schema, { default? })` | a live value (a default makes it optional) | a function of the host snapshot |
| `callback(fields)` | a moment the host may act on | `{ actions?, updateMemory?, also? , target? }` (see rule 10 for targets) |
| `gate()` | a check only the host can make | a guard returning `true` or `deny(code)`; `() => true` allows |
| `request.commit(...)` / `request.read(...)` | one operation the host runs for the fragment | `(reply) => operation action` (section 2.2) |

**Placement and supply:**

```ts
// host definition
embeds: { settle: Debounce({ wait: "300 millis" }) }        // trait: lives with the host
states: [{ DELETE_ASK: Confirm }]                            // subroutine: a state

// host machine
embeds: { settle: { input?, props? } }
states: { DELETE_ASK: { props?, on?, exits?, abandoned? } }  // entered with S.DELETE_ASK or S.X.with(input)
```

### 2.2 Requests (operations without I/O in the fragment)

The **host** knows its error tags; the **fragment** knows what uncertainty means for it (opus-split's division).

```ts
send: request.commit({
  input: { request },                          // everything the operation may read; the host select sees only { payload }
  success: {},                                 // payload of the success reply
  failures: { Busy: {}, Refused: { reason: Schema.String } },   // named failure replies; the host maps its tags onto them
})
```

Replies reach the fragment as events named `<prop><Reply>`:

| Reply | Meaning | Mapped by |
| --- | --- | --- |
| `SendSucceeded`, `SendBusy`, `SendRefused` | success and the declared failures (definitive) | the host (success is required) |
| `SendNotSent` | guaranteed never invoked: pre-invocation cancel, never-acknowledged restore, or a select defect | the runtime |
| `SendUnknown { attempt }` | invoked, outcome unknown | the runtime |
| `SendInterrupted { attempt }` | the adapter reported an interrupt, which may follow invocation (Operations O7); treated like unknown | the runtime |
| `SendDefect { attempt }` | a result mapper or write threw after invocation; the request still ends, with the Attempt | the runtime |

`request.read` has `Succeeded`, failures, `Interrupted` and `Defect` only: reads have no Attempt and no unknown
(Operations O2). The brands matter: `success` accepts only `reply.success` and `failure` tags only
`reply.failures.*`, so a host cannot map an unknown outcome onto a retryable reply (H4).

Host binding (one operation; the tokens exist only here):

```ts
send: (reply) => O.Tickets.delete.commit(({ payload }) => payload.request, {   // payload only: no live reads (D2)
  outcomes: {
    success: reply.success,
    failure: { TicketLocked: reply.failures.Busy, NotAllowed: reply.failures.Refused.from(() => ({ reason: "Not allowed" })) },
  },
}),
```

Guarantees:
- Exactly one operation per binding (return type). A second call while one is outstanding rejects the turn
  before publication, like a pre-commit defect; no reply is ever delivered for a call that was not admitted,
  and every reply carries the entry generation and call identity (L8).
- The bound commit's descriptor concurrency must be `serialize` or `cancel`; `reject` and `allow` are
  construction errors. A rejected call would never answer, and `allow` lets an older write land last.
- A throwing select, mapper or write still ends the call: `SendNotSent` before invocation, `SendDefect` after.
- A restored in-flight call is answered `SendNotSent` (not acknowledged) or `SendUnknown` (acknowledged).
- **`abandoned` is required on every commit binding**, whatever the departure: a host transition, the
  subroutine's own exit, an enclosing exit, or a trait callback target. One handler shape serves all of them:

```ts
abandoned: { save: { updateMemory?, actions? } }     // no target (E5); payload: { outcome, attempt }
// outcome: "pending" | "success" | "failure" | "notSent" | "unknown" | "interrupt" | "defect"
// attempt: the commit's Attempt (null for notSent)
```

The handler runs **twice** per departure with a call outstanding: once in the departure turn with
`outcome: "pending"` and the admitted Attempt (so the host's guards see the pending commit at once, L7), and
again when the late outcome settles. It never moves the actor; a host reconciles through an explicit event
(`Reconcile`, section 2.8) using `O.x.retry(attempt)`. Reads need no `abandoned`: a late read reply is dropped
and reported.

### 2.3 Shared fragments

```ts
// fragments.ts
import { Duration, Schema } from "effect";
import { Attempt, callback, deny, gate, prop, request, subroutine, trait } from "flow-state";

// ── Debounce (trait): onSettled fires once, `wait` after the last Input ─────
// Input is a hostEvent: the host must update its own value first, so nobody may send it directly (H1).
export const Debounce = (p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      contract: {
        hostEvents: { Input: {} },
        props: { onSettled: callback() },
      },
      internalEvents: { Due: {} },
      memory: { edits: Schema.Int, settled: Schema.Int },   // pending = edits !== settled
      initial: () => ({ edits: 0, settled: 0 }),
    },
    ({ E, P }) => ({
      // restartOn is safe on a trait root: armed once at host start with edits = 0 as the baseline.
      schedules: {
        quiet: { schedule: p.wait, send: E.Due, restartOn: ({ memory }) => memory.edits },
      },
      on: {
        Input: { target: "self", updateMemory: ({ memory }) => ({ edits: memory.edits + 1 }) },
        Due: { target: "self", updateMemory: ({ memory }) => ({ settled: memory.edits }), actions: [P.onSettled] },
      },
    }),
  );

// ── Field (trait): a validated value; error is derived with it, never copied ─
export const Field = <V>(value: Schema.Codec<V>, p: { rule: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      contract: {
        input: { start: value },
        events: { Set: { value } },
        props: { canEdit: gate() },
      },
      memory: { value, error: Schema.NullOr(Schema.String) },
      initial: ({ input }) => ({ value: input.start, error: p.rule(input.start) }),
    },
    ({ P }) => ({
      on: {
        Set: {
          target: "self",
          guard: P.canEdit,
          updateMemory: ({ event }) => ({ value: event.value, error: p.rule(event.value) }),
        },
      },
    }),
  );

// ── SettledField (trait in trait): a Field plus a Debounce ──────────────────
export const SettledField = <V>(
  value: Schema.Codec<V>,
  p: { rule: (v: V) => string | null; wait: Duration.Input },
) =>
  trait(
    {
      id: "SettledField",
      contract: {
        input: { start: value },
        events: { Set: { value } },
        props: { canEdit: gate(), onSettled: callback({ value }) },
      },
      embeds: { field: Field(value, { rule: p.rule }), quiet: Debounce({ wait: p.wait }) },
    },
    ({ E, P }) => ({
      embeds: {
        field: { input: ({ input }) => ({ start: input.start }), props: { canEdit: P.canEdit } },
        quiet: {
          props: { onSettled: { actions: [P.onSettled.from(({ memory }) => ({ value: memory.field.value }))] } },
        },
      },
      on: {
        // A parent reaches its children's events; the outside does not.
        Set: {
          target: "self",
          also: [E.field.Set.from(({ event }) => ({ value: event.value })), E.quiet.Input],
        },
      },
    }),
  );

// ── Confirm (subroutine): one state, two ways out ───────────────────────────
export const Confirm = subroutine(
  {
    id: "Confirm",
    contract: {
      events: { Yes: {}, No: {} },
      exits: { Confirmed: {}, Declined: {} },
    },
  },
  ({ exits }) => ({ on: { Yes: exits.Confirmed, No: exits.Declined } }),
);

// ── CommitWithRetry (subroutine with states) ────────────────────────────────
// The request is frozen at start. The first send and every retry send that same request.
export const CommitWithRetry = <R>(request_: Schema.Codec<R>, p: { backoff: Duration.Input }) =>
  subroutine(
    {
      id: "CommitWithRetry",
      contract: {
        input: { request: request_ },
        events: { Cancel: {} },
        props: {
          maxRetries: prop(Schema.Int, { default: 3 }),
          send: request.commit({
            input: { request: request_ },
            success: {},
            failures: { Busy: {}, Refused: { reason: Schema.String } },
          }),
        },
        exits: {
          Done: {},
          Failed: { reason: Schema.String },
          Uncertain: { attempt: Attempt },     // a call may have applied: reconcile, never re-send
          Unapplied: {},                       // nothing applied and nothing outstanding: safe to start over
        },
      },
      states: ["SENDING", "BACKOFF"],
      internalEvents: { RetryDue: {} },
      memory: { request: request_, retries: Schema.Int },
      initial: ({ input }) => ({ request: input.request, retries: 0 }),
    },
    ({ S, E, P, exits }) => ({
      default: S.SENDING,
      start: [P.send.from(({ input }) => ({ request: input.request }))],   // runs in the entering turn
      states: {
        // SENDING is the only state with a call outstanding; it handles every reply (flow check).
        SENDING: {
          on: {
            SendSucceeded: exits.Done,
            SendRefused: exits.Failed.from(({ event }) => ({ reason: event.reason })),
            SendNotSent: exits.Unapplied,
            SendUnknown: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })),
            SendInterrupted: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })),
            SendDefect: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })),
            SendBusy: [
              {
                target: exits.Failed.from(({ memory }) => ({ reason: `busy after ${memory.retries} retries` })),
                guard: ({ memory, props }) => memory.retries >= props.maxRetries || deny("RetriesLeft"),
              },
              { target: S.BACKOFF, updateMemory: ({ memory }) => ({ retries: memory.retries + 1 }) },
            ],
          },
        },
        BACKOFF: {
          schedules: {
            retry: { schedule: ({ memory }) => Duration.times(p.backoff, 2 ** (memory.retries - 1)), send: E.RetryDue },
          },
          on: {
            RetryDue: { target: S.SENDING, actions: [P.send.from(({ memory }) => ({ request: memory.request }))] },
            Cancel: exits.Unapplied,                          // every earlier call was definitively refused
          },
        },
      },
    }),
  );

// ── Poll (subroutine, no exits): runs until the host leaves; refreshes never stack ─
export const Poll = (p: { every: Duration.Input }) =>
  subroutine(
    {
      id: "Poll",
      contract: {
        input: { subject: Schema.String },
        props: {
          refresh: request.read({
            input: { subject: Schema.String },
            success: {},
            failures: { Stale: {} },
          }),
        },
      },
      states: ["WAITING", "REFRESHING"],
      internalEvents: { Tick: {} },
      memory: { subject: Schema.String, ticks: Schema.Int, failures: Schema.Int },
      initial: ({ input }) => ({ subject: input.subject, ticks: 0, failures: 0 }),
    },
    ({ S, E, P }) => {
      const again = { target: S.WAITING };
      return {
        default: S.WAITING,
        states: {
          // The timer arms on entry to WAITING; the next tick can only follow a settled refresh.
          WAITING: {
            schedules: { tick: { schedule: p.every, send: E.Tick } },
            on: {
              Tick: {
                target: S.REFRESHING,
                updateMemory: ({ memory }) => ({ ticks: memory.ticks + 1 }),
                actions: [P.refresh.from(({ memory }) => ({ subject: memory.subject }))],
              },
            },
          },
          REFRESHING: {
            on: {
              RefreshSucceeded: { ...again, updateMemory: () => ({ failures: 0 }) },
              RefreshStale: { ...again, updateMemory: ({ memory }) => ({ failures: memory.failures + 1 }) },
              RefreshInterrupted: { ...again, updateMemory: ({ memory }) => ({ failures: memory.failures + 1 }) },
              RefreshDefect: { ...again, updateMemory: ({ memory }) => ({ failures: memory.failures + 1 }) },
            },
          },
        },
      };
    },
  );

// ── AddressStep (subroutine containing two traits and a subroutine) ─────────
export const Address = Schema.Struct({ street: Schema.String, city: Schema.String });
const required = (label: string) => (v: string) => (v.trim() === "" ? `${label} is required` : null);

export const AddressStep = subroutine(
  {
    id: "AddressStep",
    contract: {
      input: { address: Schema.NullOr(Address) },             // what the host kept, so going back keeps it
      events: {
        SetStreet: { value: Schema.String },
        SetCity: { value: Schema.String },
        Next: {},
        Previous: {},
        Approve: {},
        Revise: {},
      },
      // Back hands back what the user typed (D7).
      exits: { Done: { address: Address }, Back: { draft: Address } },
    },
    states: ["FILLING", { REVIEW: Confirm }],
    embeds: {
      street: Field(Schema.String, { rule: required("Street") }),
      city: Field(Schema.String, { rule: required("City") }),
    },
  },
  ({ S, E, exits }) => ({
    default: S.FILLING,
    embeds: {
      street: { input: ({ input }) => ({ start: input.address?.street ?? "" }), props: { canEdit: () => true } },
      city: { input: ({ input }) => ({ start: input.address?.city ?? "" }), props: { canEdit: () => true } },
    },
    on: {
      Previous: exits.Back.from(({ memory }) => ({
        draft: { street: memory.street.value, city: memory.city.value },
      })),
    },
    states: {
      FILLING: {
        on: {
          SetStreet: { target: "self", also: [E.street.Set.from(({ event }) => ({ value: event.value }))] },
          SetCity: { target: "self", also: [E.city.Set.from(({ event }) => ({ value: event.value }))] },
          Next: {
            target: S.REVIEW,
            guard: ({ memory }) => (memory.street.error === null && memory.city.error === null) || deny("Invalid"),
          },
        },
      },
      REVIEW: {
        on: {
          Approve: { target: "self", also: [E.REVIEW.Yes] },
          Revise: { target: "self", also: [E.REVIEW.No] },
        },
        exits: {
          Confirmed: exits.Done.from(({ memory }) => ({
            address: { street: memory.street.value, city: memory.city.value },
          })),
          Declined: S.FILLING,
        },
      },
    },
  }),
);

// ── AutoSave (subroutine): saves after a quiet period; no loop from normalisation ─
// `subject` is an opaque identity echoed in every save so the host select can read payload only.
export const AutoSave = <V>(value: Schema.Codec<V>, p: { quiet: Duration.Input }) =>
  subroutine(
    {
      id: "AutoSave",
      contract: {
        input: { base: value, subject: Schema.String },
        events: { Edit: { value }, Close: {} },
        props: {
          canEdit: gate(),
          save: request.commit({
            input: { subject: Schema.String, value },
            success: { value },                                  // the server's normalised value
            failures: { Refused: { reason: Schema.String } },
          }),
        },
        // Every abnormal ending hands back the draft (D7).
        exits: {
          Closed: { value },
          Failed: { reason: Schema.String, draft: value },
          Uncertain: { attempt: Attempt, draft: value },
        },
      },
      states: ["CLEAN", "DIRTY", { SAVING: ["PLAIN", "EDITED"] }],
      internalEvents: { QuietDue: {} },
      memory: { subject: Schema.String, draft: value, base: value, edits: Schema.Int },
      initial: ({ input }) => ({ subject: input.subject, draft: input.base, base: input.base, edits: 0 }),
    },
    ({ S, E, P, exits }) => {
      const edit = {
        guard: P.canEdit,
        updateMemory: ({ event, memory }) => ({ draft: event.value, edits: memory.edits + 1 }),
      };
      const uncertain = exits.Uncertain.from(({ event, memory }) => ({ attempt: event.attempt, draft: memory.draft }));
      return {
        default: S.CLEAN,
        states: {
          CLEAN: {
            on: {
              Edit: { ...edit, target: S.DIRTY },
              Close: exits.Closed.from(({ memory }) => ({ value: memory.draft })),
            },
          },
          // No restartOn: it would stay idle in a state entered by the Edit that changed it.
          // The schedule arms on entry; each further Edit re-enters DIRTY, which restarts it.
          DIRTY: {
            schedules: { quiet: { schedule: p.quiet, send: E.QuietDue } },
            on: {
              Edit: { ...edit, target: S.DIRTY },
              QuietDue: {
                target: S.SAVING.PLAIN,
                actions: [P.save.from(({ memory }) => ({ subject: memory.subject, value: memory.draft }))],
              },
            },
          },
          SAVING: {
            on: {
              SaveRefused: exits.Failed.from(({ event, memory }) => ({ reason: event.reason, draft: memory.draft })),
              SaveNotSent: exits.Failed.from(({ memory }) => ({ reason: "not sent", draft: memory.draft })),
              SaveUnknown: uncertain,
              SaveInterrupted: uncertain,
              SaveDefect: uncertain,
            },
            states: {
              // Nothing was edited during the save: the server's value replaces the draft silently.
              PLAIN: {
                on: {
                  Edit: { ...edit, target: S.SAVING.EDITED },
                  SaveSucceeded: { target: S.CLEAN, updateMemory: ({ event }) => ({ base: event.value, draft: event.value }) },
                },
              },
              // The user kept typing: keep their draft, adopt the server's base, save again.
              EDITED: {
                on: {
                  Edit: { ...edit, target: "self" },
                  SaveSucceeded: { target: S.DIRTY, updateMemory: ({ event }) => ({ base: event.value }) },
                },
              },
            },
          },
        },
      };
    },
  );
```

### 2.4 Debounce: `Catalogue`

```ts
// catalogue.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Debounce } from "./fragments";

export const Catalogue = definition({
  id: "Shop/Catalogue",
  states: ["BROWSING"],
  embeds: { settle: Debounce({ wait: "300 millis" }) },
  events: { SetQuery: { text: Schema.String } },
  memory: { query: Schema.String },
  initial: () => ({ query: "" }),
  operations: { Products: ProductsDomain },
});

// catalogue.machine.ts
export const CatalogueMachine = machine(Catalogue, ({ S, E, O }) => {
  const search = O.Products.search.refetch(({ memory }) => ({ text: memory.query }));  // live query at settle time is right here
  return {
    default: S.BROWSING,
    embeds: { settle: { props: { onSettled: { actions: [search] } } } },
    on: {
      SetQuery: { target: "self", updateMemory: ({ event }) => ({ query: event.text }), also: [E.settle.Input] },
    },
    states: { BROWSING: {} },
  };
});
```

```tsx
// component
catalogue.send(Catalogue.E.SetQuery({ text }));
const query = useView(catalogue, (s) => s.memory.query);
const pending = useView(catalogue, (s) => s.memory.settle.edits !== s.memory.settle.settled);
// catalogue.send(Catalogue.E.settle.Input());   // type error: Input is a hostEvent, not in the outside E
```

### 2.5 Validated field: `ProfileForm`

```ts
// profile-form.definition.ts
export const ProfileForm = definition({
  id: "Account/ProfileForm",
  states: ["EDITING", "SAVED"],
  embeds: { displayName: Field(Schema.String, { rule: required("Name") }) },
  events: { Submit: {} },
  input: { name: Schema.String, readOnly: Schema.Boolean },
  memory: { readOnly: Schema.Boolean },
  initial: ({ input }) => ({ readOnly: input.readOnly }),
});

// profile-form.machine.ts
export const ProfileFormMachine = machine(ProfileForm, ({ S }) => ({
  default: S.EDITING,
  embeds: {
    displayName: {
      input: ({ input }) => ({ start: input.name }),
      props: { canEdit: ({ memory }) => !memory.readOnly || deny("ReadOnly") },
    },
  },
  states: {
    EDITING: {
      on: { Submit: { target: S.SAVED, guard: ({ memory }) => memory.displayName.error === null || deny("InvalidName") } },
    },
    SAVED: {},
  },
}));
```

```tsx
form.send(ProfileForm.E.displayName.Set({ value }));              // Field's own event, at its path; no host event needed
const name = useView(form, (s) => s.memory.displayName);          // { value, error }
const canSubmit = useView(form, (s) => check(s, ProfileForm.E.Submit())._tag === "Allowed");
```

`check` of `displayName.Set` returns `Denied` with code `ReadOnly`.

### 2.6 Confirm and commit with retry: `TicketEditor`

```ts
// ticket-editor.definition.ts
const DeleteTicket = CommitWithRetry(Schema.Struct({ ticketId: Schema.String }), { backoff: "2 seconds" });

export const TicketEditor = definition({
  id: "Desk/TicketEditor",
  states: ["VIEWING", { DELETE_ASK: Confirm }, { DELETING: DeleteTicket }, "DELETED"],
  embeds: { title: SettledField(Schema.String, { rule: required("Title"), wait: "300 millis" }) },
  events: { RequestDelete: {}, Reconcile: {} },       // Confirm's Yes and No are public: the UI sends E.DELETE_ASK.Yes
  internalEvents: { DeleteSettled: {}, DeleteRefused: {}, DeleteUnresolved: {} },
  input: { ticketId: Schema.String, title: Schema.String, locked: Schema.Boolean },
  memory: {
    ticketId: Schema.String,
    locked: Schema.Boolean,
    notice: Schema.NullOr(Schema.String),
    unsure: Schema.NullOr(Attempt),                   // a delete that may have applied
    pendingDelete: Schema.NullOr(Attempt),            // a delete still in flight after we left DELETING
  },
  initial: ({ input }) => ({ ticketId: input.ticketId, locked: input.locked, notice: null, unsure: null, pendingDelete: null }),
  operations: { Tickets: TicketsDomain },
});

// ticket-editor.machine.ts
export const TicketEditorMachine = machine(TicketEditor, ({ S, E, O }) => {
  const taken = O.Tickets.titleTaken.refetch(({ payload }) => ({ title: payload.value }));
  // Reconcile re-runs the SAME attempt; it never starts a second delete.
  const reconcile = O.Tickets.delete.retry(({ memory }) => memory.unsure, {
    outcomes: {
      success: E.DeleteSettled,
      failure: { TicketLocked: E.DeleteUnresolved, NotAllowed: E.DeleteRefused },
      unknown: E.DeleteUnresolved,
      interrupt: E.DeleteUnresolved,
      defect: E.DeleteUnresolved,
    },
  });
  // (select narrowing: the Reconcile guard proves memory.unsure is not null; the type spike must support that.)

  return {
    default: S.VIEWING,
    embeds: {
      title: {
        input: ({ input }) => ({ start: input.title }),
        props: {
          onSettled: { actions: [taken] },
          canEdit: ({ memory }) => !memory.locked || deny("Locked"),
        },
      },
    },
    states: {
      VIEWING: {
        on: {
          RequestDelete: {
            target: S.DELETE_ASK,
            guard: ({ memory }) =>
              (memory.unsure === null && memory.pendingDelete === null) || deny("DeleteUnconfirmed"),
          },
          Reconcile: { target: "self", guard: ({ memory }) => memory.unsure !== null || deny("NothingToReconcile"), actions: [reconcile] },
          DeleteSettled: S.DELETED,
          DeleteRefused: { target: "self", updateMemory: () => ({ unsure: null, notice: "Not allowed" }) },
          DeleteUnresolved: { target: "self", updateMemory: () => ({ notice: "Still unconfirmed. Try again later." }) },
        },
      },
      DELETE_ASK: {
        exits: {
          Confirmed: S.DELETING.with(({ memory }) => ({ request: { ticketId: memory.ticketId } })),
          Declined: S.VIEWING,
        },
      },
      DELETING: {
        props: {
          maxRetries: ({ memory }) => (memory.locked ? 6 : 2),
          send: (reply) =>
            O.Tickets.delete.commit(({ payload }) => payload.request, {
              outcomes: {
                success: reply.success,
                failure: { TicketLocked: reply.failures.Busy, NotAllowed: reply.failures.Refused.from(() => ({ reason: "Not allowed" })) },
              },
            }),
        },
        // Required on every commit binding. No host transition leaves DELETING today, but exits do.
        abandoned: {
          send: {
            updateMemory: ({ payload }) =>
              payload.outcome === "pending"
                ? { pendingDelete: payload.attempt }
                : { pendingDelete: null, notice: `A delete you left behind ended: ${payload.outcome}` },
          },
        },
        exits: {
          Done: S.DELETED,
          Failed: { target: S.VIEWING, updateMemory: ({ payload }) => ({ notice: payload.reason }) },
          Uncertain: {
            target: S.VIEWING,
            updateMemory: ({ payload }) => ({ unsure: payload.attempt, notice: "The delete may have gone through." }),
          },
          Unapplied: S.VIEWING,
        },
      },
      DELETED: {},
    },
  };
});
```

```tsx
editor.send(TicketEditor.E.title.Set({ value }));                  // the field's event, at its path
editor.send(TicketEditor.E.RequestDelete());
editor.send(TicketEditor.E.DELETE_ASK.Yes());                      // Confirm's own event, at its path
const title = useView(editor, (s) => s.memory.title.field);       // { value, error }
const backoff = useView(editor, (s) => TicketEditor.S.DELETING.BACKOFF.is(s));
const retries = useView(editor, (s) => (TicketEditor.S.DELETING.is(s) ? s.memory.DELETING.retries : 0));
const canCancel = useView(editor, (s) => check(s, TicketEditor.E.DELETING.Cancel())._tag === "Allowed");  // false while SENDING
```

### 2.7 Poll until the host leaves: `JobMonitor`

```ts
export const JobMonitor = definition({
  id: "Jobs/JobMonitor",
  states: ["IDLE", { WATCHING: Poll({ every: "5 seconds" }) }, "STOPPED"],
  events: { Watch: {}, StopWatching: {} },
  input: { jobId: Schema.String },
  memory: { jobId: Schema.String },
  initial: ({ input }) => ({ jobId: input.jobId }),
  operations: { Jobs: JobsDomain },
});

export const JobMonitorMachine = machine(JobMonitor, ({ S, O }) => {
  const watch = S.WATCHING.with(({ memory }) => ({ subject: memory.jobId }));
  return {
    default: S.IDLE,
    states: {
      IDLE: { on: { Watch: watch } },
      WATCHING: {
        props: {
          refresh: (reply) =>
            O.Jobs.byId.refetch(({ payload }) => ({ jobId: payload.subject }), {
              outcomes: { success: reply.success, failure: { JobUnavailable: reply.failures.Stale } },
            }),
        },
        on: { StopWatching: S.STOPPED },                    // the host leaves: timers stop, memory is dropped, a late read is dropped
      },
      STOPPED: { on: { Watch: watch } },                    // fresh: counters restart at 0
    },
  };
});
```

```tsx
monitor.send(JobMonitor.E.Watch());
monitor.send(JobMonitor.E.StopWatching());
const ticks = useView(monitor, (s) => (JobMonitor.S.WATCHING.is(s) ? s.memory.WATCHING.ticks : 0));
const failing = useView(monitor, (s) => (JobMonitor.S.WATCHING.is(s) ? s.memory.WATCHING.failures > 2 : false));
```

### 2.8 Two-level nest: `Checkout` > `AddressStep` > fields (and `Confirm`)

The host forwards nothing: `E.ADDRESS.*` are AddressStep's own events at its path.

```ts
// checkout.definition.ts
const Order = Schema.Struct({ cartId: Schema.String, address: Address });
const Place = CommitWithRetry(Order, { backoff: "1 second" });

export const Checkout = definition({
  id: "Shop/Checkout",
  states: ["CART", { ADDRESS: AddressStep }, { PLACING: Place }, "UNSURE", "PLACED", "FAILED"],
  events: { Begin: {}, Abandon: {}, TryAgain: {}, Reconcile: {} },
  internalEvents: { OrderSettled: {}, OrderRefused: {}, StillUnknown: {} },
  input: { cartId: Schema.String },
  memory: {
    cartId: Schema.String,
    address: Schema.NullOr(Address),
    failure: Schema.NullOr(Schema.String),
    attempt: Schema.NullOr(Attempt),               // an order that may have applied
    pendingOrder: Schema.NullOr(Attempt),          // an order still in flight after PLACING was left
  },
  initial: ({ input }) => ({ cartId: input.cartId, address: null, failure: null, attempt: null, pendingOrder: null }),
  operations: { Orders: OrdersDomain },
});

// checkout.machine.ts
export const CheckoutMachine = machine(Checkout, ({ S, E, O }) => {
  const enterAddress = S.ADDRESS.with(({ memory }) => ({ address: memory.address }));
  const clear = ({ memory }: { memory: { pendingOrder: unknown; attempt: unknown } }) =>
    memory.pendingOrder === null && memory.attempt === null;
  // An unsure order is only ever reconciled with the SAME attempt; it never starts a second commit.
  const reconcile = O.Orders.place.retry(({ memory }) => memory.attempt, {
    outcomes: {
      success: E.OrderSettled,
      failure: { StoreBusy: E.StillUnknown, OutOfStock: E.OrderRefused },
      unknown: E.StillUnknown,
      interrupt: E.StillUnknown,
      defect: E.StillUnknown,
    },
  });
  // (select narrowing: the Reconcile guard proves memory.attempt is not null; the type spike must support that.)

  return {
    default: S.CART,
    states: {
      CART: { on: { Begin: { target: enterAddress, guard: (c) => clear(c) || deny("OrderPending") } } },
      ADDRESS: {
        on: {
          // Leaving is the host's right (L4); it reads the fragment's memory so typed text is kept (D7).
          Abandon: {
            target: S.CART,
            updateMemory: ({ memory }) => ({
              address: { street: memory.ADDRESS.street.value, city: memory.ADDRESS.city.value },
            }),
          },
        },
        exits: {
          Done: {
            target: S.PLACING.with(({ memory, payload }) => ({ request: { cartId: memory.cartId, address: payload.address } })),
            updateMemory: ({ payload }) => ({ address: payload.address }),
          },
          Back: { target: S.CART, updateMemory: ({ payload }) => ({ address: payload.draft }) },
        },
      },
      PLACING: {
        // maxRetries unbound: default 3.
        props: {
          send: (reply) =>
            O.Orders.place.commit(({ payload }) => payload.request, {
              outcomes: {
                success: reply.success,
                failure: { StoreBusy: reply.failures.Busy, OutOfStock: reply.failures.Refused.from(() => ({ reason: "Out of stock" })) },
              },
            }),
        },
        abandoned: {
          send: {
            updateMemory: ({ payload }) =>
              payload.outcome === "pending"
                ? { pendingOrder: payload.attempt }
                : { pendingOrder: null, attempt: payload.outcome === "unknown" || payload.outcome === "interrupt" || payload.outcome === "defect" ? payload.attempt : null },
          },
        },
        exits: {
          Done: S.PLACED,
          Failed: { target: S.FAILED, updateMemory: ({ payload }) => ({ failure: payload.reason }) },
          Uncertain: { target: S.UNSURE, updateMemory: ({ payload }) => ({ attempt: payload.attempt }) },
          Unapplied: enterAddress,
        },
      },
      UNSURE: {
        on: {
          Reconcile: { target: "self", guard: ({ memory }) => memory.attempt !== null || deny("NoAttempt"), actions: [reconcile] },
          OrderSettled: { target: S.PLACED, updateMemory: () => ({ attempt: null }) },
          OrderRefused: { target: S.FAILED, updateMemory: () => ({ attempt: null, failure: "Out of stock" }) },
          StillUnknown: { target: "self" },
        },
      },
      PLACED: {},
      FAILED: { on: { TryAgain: { target: enterAddress, guard: (c) => clear(c) || deny("OrderPending") } } },
    },
  };
});
```

```tsx
const form = useView(checkout, (s) => (Checkout.S.ADDRESS.is(s) ? s.memory.ADDRESS : undefined));
const canNext = useView(checkout, (s) => check(s, Checkout.E.ADDRESS.Next())._tag === "Allowed");

<input
  value={form?.street.value ?? ""}
  onChange={(e) => checkout.send(Checkout.E.ADDRESS.SetStreet({ value: e.target.value }))}
/>;
{form?.street.error}
<button disabled={!canNext} onClick={() => checkout.send(Checkout.E.ADDRESS.Next())}>Next</button>;
// checkout.send(Checkout.E.ADDRESS.street.Set(...))   // type error: nested children's events are not reachable
```

Send and read paths agree (`E.ADDRESS.SetStreet`, `memory.ADDRESS.street`). Host cost per level of nesting:
nothing. Cost inside `AddressStep`: one declared event and one `.from` line per field input.

### 2.9 AutoSave with its host: `NoteEditor`

```ts
// note-editor.definition.ts
const SaveNote = AutoSave(Schema.String, { quiet: "800 millis" });

export const NoteEditor = definition({
  id: "Notes/NoteEditor",
  states: ["LIST", { EDITING: SaveNote }, "BROKEN"],
  events: { Open: {}, Leave: {} },
  input: { noteId: Schema.String, body: Schema.String },
  memory: {
    noteId: Schema.String,
    body: Schema.String,
    syncNote: Schema.NullOr(Schema.String),
    problem: Schema.NullOr(Schema.String),
    keptDraft: Schema.NullOr(Schema.String),
    unsure: Schema.NullOr(Attempt),
    pendingSave: Schema.NullOr(Attempt),           // a save still in flight after Leave
  },
  initial: ({ input }) => ({
    noteId: input.noteId, body: input.body, syncNote: null, problem: null, keptDraft: null, unsure: null, pendingSave: null,
  }),
  operations: { Notes: NotesDomain },
});

// note-editor.machine.ts
export const NoteEditorMachine = machine(NoteEditor, ({ S, O }) => {
  const open = ({ memory }) => ({ base: memory.keptDraft ?? memory.body, subject: memory.noteId });
  // A new editing session starts only when the previous save has settled (L7): the older save cannot land last.
  const openGuard = ({ memory }) => memory.pendingSave === null || deny("SavePending");
  return {
    default: S.LIST,
    states: {
      LIST: { on: { Open: { target: S.EDITING.with(open), guard: openGuard } } },
      EDITING: {
        props: {
          canEdit: () => true,
          save: (reply) =>
            O.Notes.save.commit(({ payload }) => ({ noteId: payload.subject, body: payload.value }), {
              outcomes: {
                success: reply.success.from(({ value }) => ({ value: value.body })),   // server-normalised body
                failure: { Invalid: reply.failures.Refused.from(({ error }) => ({ reason: error.message })) },
              },
            }),
        },
        on: { Leave: { target: S.LIST, updateMemory: ({ memory }) => ({ body: memory.EDITING.draft }) } },
        abandoned: {
          save: {
            updateMemory: ({ payload }) =>
              payload.outcome === "pending"
                ? { pendingSave: payload.attempt }
                : { pendingSave: null, syncNote: `last save: ${payload.outcome}` },
          },
        },
        exits: {
          Closed: { target: S.LIST, updateMemory: ({ payload }) => ({ body: payload.value }) },
          Failed: { target: S.BROKEN, updateMemory: ({ payload }) => ({ problem: payload.reason, keptDraft: payload.draft }) },
          Uncertain: { target: S.BROKEN, updateMemory: ({ payload }) => ({ unsure: payload.attempt, keptDraft: payload.draft }) },
        },
      },
      BROKEN: { on: { Open: { target: S.EDITING.with(open), guard: openGuard } } },
    },
  };
});
```

```tsx
note.send(NoteEditor.E.EDITING.Edit({ value }));
const draft = useView(note, (s) => (NoteEditor.S.EDITING.is(s) ? s.memory.EDITING.draft : ""));
const saving = useView(note, (s) => NoteEditor.S.EDITING.SAVING.is(s));
```

Why no loop (D3): a save starts only from `DIRTY`; `DIRTY` is entered by `Edit`, or by a reply from `EDITED` where
the user had already edited; the server's normalised value in `PLAIN` writes `draft` and `base` and goes to
`CLEAN`, which has no timer. Limit: always-there behaviour with phases keeps its phase in memory; a phased
behaviour that occupies the host's only active state must be a subroutine, as AutoSave is.

### 2.10 Keywords

| Word | Mark | Where |
| --- | --- | --- |
| `trait`, `subroutine` | **new** | constructors |
| `contract` | **new** | the block holding everything the outside sees |
| `events` | existing in the plans (public events, here at the fragment's path) | |
| `hostEvents` | **new** | placer-only events |
| `props` (in `contract`), `prop(Schema, {default?})`, `callback(fields)`, `gate()`, `request.commit`, `request.read` | **new** | `gate` replaces `guard()` (A4); no `optional` option |
| `reply` (binding argument) with `.success`, `.failures.X` | **new** | request binding |
| `abandoned` | **new** | placement; one handler `{ updateMemory?, actions? }` with `{ outcome, attempt }` |
| `exits` | **new** | subroutine endings; `exits.X`, `exits.X.from(f)` |
| `start` | **new** | fragment build only: actions run in the entering turn |
| `S.X.with(f)` | **new** | supply a subroutine's `input` on entry |
| `also` | **new** | compose a child's event in the same turn |
| `embeds`, `P`, `payload` | **new** (from the draft) | traits in a root; prop tokens; handler argument |
| `input`, `initial`, `memory`, `internalEvents`, `states`, `default`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `schedule`, `send`, `restartOn`, `definition`, `machine`, `operations`, `deny`, `check`, `S`, `E`, `O`, `"self"`, `.from`, `event`, `memory` | existing in the plans | `input` keeps its meaning |
| `success/failure/unknown/interrupt/defect`, `Attempt`, `refetch`, `commit`, `retry` | existing in Operations | unchanged |
| `story.fragment`, `requests`, `replies`, `.leave`, `.setProps` | **new** | section 2.11 |
| reply event suffixes `Succeeded`, `NotSent`, `Unknown`, `Interrupted`, `Defect`; `abandoned` outcome values `pending`, `success`, `failure`, `notSent`, `unknown`, `interrupt`, `defect` | **new** (derived) | |
| every other name (`Debounce`, `settle`, `DELETE_ASK`, `onSettled`, `Busy`, `Done`, ...) | author-chosen | |

**Count.** Declared new spellings: 24 (trait, subroutine, contract, hostEvents, prop, default, callback, gate,
request.commit, request.read, reply, abandoned, exits, start, with, also, embeds, P, payload, story.fragment,
requests, replies, leave, setProps). Derived spellings: 5 reply suffixes plus 7 outcome values. Before round 2:
26 declared (it had `optional`, `story.trait` and `story.subroutine`). Numbered rules: 18 (was 17 numbered plus
about 8 scattered).

Removed since the first draft: `accepts`, `forward`, `results`, `.answer`, bare payload copy, optional gates and
callbacks, `story.trait`/`story.subroutine`, the `Cancelled`, `Crashed` and `NotSent` exits.

### 2.11 Testing alone

```ts
story.fragment(fragment, { input?, props?, requests? })   // the kind is known from the value
// commands: send(event) (events and hostEvents of the fragment), setProps(p), leave(), advance, process, checkpoint, run
// run: calls.<callback>[], requests.<name>[], exit, abandoned[], denials[], checkpoints
```

Testing O3 forbids a fixture from injecting operation outcomes. A Story therefore does not script replies; it
binds each `request` prop to a **scripted adapter fixture**, `replies([...])`: a synthetic binding maps
replies one to one, and a scripted adapter behind it succeeds, fails with a tag, hangs, reports unknown or
interrupts. Every reply still travels the real outcome path (credit: sonnet-single `request.fixture`). Script
items: `{ success }`, `{ failure: "Busy" }`, `"unknown"`, `"interrupt"`, `"defect"`, `"never"`.

```ts
const Req = Schema.Struct({ ticketId: Schema.String });
const commit = CommitWithRetry(Req, { backoff: "1 second" });

test("retry sends the confirmed request, not the live one", async () => {
  const run = await story.fragment(commit, {
    input: { request: { ticketId: "t1" } },
    props: { maxRetries: 3 },
    requests: { send: replies([{ failure: "Busy" }, { success: {} }]) },
  }).process().advance("1 second").process().run();
  expect(run.requests.send).toEqual([{ request: { ticketId: "t1" } }, { request: { ticketId: "t1" } }]);
  expect(run.exit?._tag).toBe("Done");
});

test("an unconfirmed send ends Uncertain and is never re-sent", async () => {
  const run = await story.fragment(commit, {
    input: { request: { ticketId: "t1" } },
    requests: { send: replies(["unknown"]) },
  }).process().advance("1 hour").process().run();
  expect(run.exit?._tag).toBe("Uncertain");
  expect(run.requests.send).toHaveLength(1);
});

test("an adapter interrupt is treated as uncertain, not as unsent", async () => {
  const run = await story.fragment(commit, {
    input: { request: { ticketId: "t1" } },
    requests: { send: replies(["interrupt"]) },
  }).process().run();
  expect(run.exit?._tag).toBe("Uncertain");
});

test("leaving mid-send records pending at once, then the late outcome", async () => {
  const run = await story.fragment(commit, {
    input: { request: { ticketId: "t1" } },
    requests: { send: replies(["never"]) },
  }).leave().run();
  expect(run.exit).toBeUndefined();
  expect(run.abandoned[0].outcome).toBe("pending");          // in the departure turn, with the Attempt
});

test("Poll has no exit, never stacks refreshes, and stops when left", async () => {
  const poll = Poll({ every: "5 seconds" });
  const run = await story.fragment(poll, {
    input: { subject: "j1" },
    requests: { refresh: replies(["never"]) },               // the first refresh never settles
  }).advance("1 minute").process().leave().run();
  expect(run.requests.refresh).toHaveLength(1);              // no second refresh while one is outstanding
});

test("a refusing host", async () => {
  const field = Field(Schema.String, { rule: required("x") });
  const run = await story.fragment(field, { input: { start: "a" }, props: { canEdit: () => deny("Locked") } })
    .send(field.E.Set({ value: "b" })).process().run();
  expect(run.denials[0].code).toBe("Locked");
});
```

A host that never answers is `replies(["never"])`: the subroutine stays in SENDING and `check` of `Cancel` is
`Unhandled`.

## 3. Rules

1. **One question:** does the actor _have_ it (trait) or _go into_ it (subroutine)?
2. **The contract is the only outside surface.** `contract: { input, events, hostEvents, props, exits }`.
3. **Placement.** Traits go in `embeds` at a host, fragment or subroutine root; subroutines are states. A trait cannot contain a subroutine. Names are unique per parent.
4. **Structure vs value.** Factory arguments are static structure. What can change after construction is a `prop`. Data fixed when something starts is `input`.
5. **Props.** Every port is required: `{}` ignores a callback, `() => true` allows a gate. Only a value `prop` may have a `default`.
6. **Schema everywhere** a shape is declared. Value props are validated in Stories and development builds only.
7. **Start.** A trait starts with the host. A subroutine starts on entry; one that declares `input` is entered only through `S.X.with(f)` (check 7 forbids default and initial paths for it and for `start`).
8. **Who sends.** `events` anyone at the fragment's path; `hostEvents` only the placer through `also`; a nested fragment's events only its parent. At the host, `also` targets only `hostEvents`.
9. **Composition (`also`, `start`, exits, `abandoned`) happens in one turn.** Every part reads the pre-turn snapshot (Machines O3); data between parts passes by payload only, so a `.with` that needs a value the same transition writes takes it from the payload. Order: host actions, then composed parts in listed order, depth first. Memory patches are disjoint. All guards must pass; any part unhandled or denied declines the whole turn, and `check` reports it (T1). At most one part may change state (`"self"` is not a state change). `also` cycles are errors. Bare tokens only for payload-free events; otherwise `.from`.
10. **Terminal deliveries are total.** A reply, an exit continuation or a timer firing is never declined: `also` reachable from such a handler may target only commands with no guard, no gate and total handlers.
11. **Callbacks act** (`actions`, `updateMemory`, `also`). A callback handler may target only states inside the node that contains the placement: a trait at the host root may target any host state; a trait inside a subroutine only that subroutine's states; a subroutine's callback never targets.
12. **Exits.** Only the subroutine takes them; the host maps every one in the state's `exits`. The value may be a state, a `.with` state, a transition, or inside a fragment one of its own exits. Abnormal exits carry the user data the subroutine owns (D7).
13. **Leaving.** The host may always leave a subroutine's state with any transition on it or an ancestor; the fragment cannot veto. Every commit binding supplies `abandoned`, whatever the departure path.
14. **Requests.** One operation per binding; select sees `{ payload }` only, so the request carries its own key; success is required; the descriptor is `serialize` or `cancel`; a second call while one is outstanding rejects the turn; a state with a call outstanding handles every reply.
15. **Subroutine lifecycle.** Fresh memory, schedules stopped, replies fenced by entry generation and call identity; the generation is persisted; a restored call is answered `NotSent` or `Unknown`.
16. **Reads are open, writes are not.** Any memory or state is readable by its full path; only the owner writes.
17. **Abandoned handlers never move the actor.** They run in the departure turn (`pending`) and again on settlement.
18. **Interrupt is not "not sent".** Only `NotSent` licenses starting over; `Interrupted`, `Unknown` and `Defect` carry an Attempt and mean reconcile.

## 4. Against problems L1 to T2

Only claims enforced by a type, by `flow check`, or by the runtime lifecycle are marked "prevents".

| # | Verdict | How |
| --- | --- | --- |
| L1 | prevents (subroutines); allows (traits, by design) | Subroutine schedules stop on leaving (runtime). A trait's timer lives with the host; scope it with a subroutine. |
| L2 | prevents, once Operations is amended | Replies carry generation and call identity; a reply from an earlier entry goes to `abandoned` or is dropped and reported. |
| L3 | prevents | Subroutine memory comes from `initial({ input })` on every entry (runtime). |
| L4 | prevents | The host may always leave (rule 13); `flow check` errors if a subroutine has no exits and no host leaving transition. |
| L5 abandoned effects | prevents the silent loss; allows the divergence | `abandoned` is a type-required handler on every commit binding, for every departure path. Whether the delete or order happened is the host's to reconcile. |
| L6 silent admission | prevents | `reject` is a construction error for bound commits; pre-invocation cancel answers `NotSent`; a throwing select ends in `NotSent`; a state with a call outstanding must handle every reply (check). |
| L7 departure gap | prevents the record gap and the ordering race; allows a deliberate second submit unless the host guards it | `pending` runs in the departure turn with the Attempt (runtime); bound commits are `serialize` or `cancel`, so an older write cannot land last. The new-submit guard (`openGuard`) is the host's; check 22 warns when none exists. |
| L8 phantom replies | prevents | A second call while one is outstanding rejects the turn before publication; replies carry call identity and generation; no reply exists for an unadmitted call. |
| E1 | prevents | Gates only where the author put them; leaving discards a hold's timers; `events` (like `Release`) are reachable by every sender and cannot be withheld by a forwarding layer. |
| E2 | prevents for events and writes; allows reads | Nested events are unreachable from outside (type). Reads of nested memory stay open (accepted cost). |
| E3 | prevents | Only `exits` end a subroutine, written inside it (type). |
| E4 refusal by forwarding | prevents for `events`; allows for `hostEvents`, by the fragment's declaration | There is no forwarding layer for public events. |
| E5 preempting observers | prevents | `abandoned` handlers have no `target` (type); a callback target never leaves its placement node (rule 11). |
| H1 | prevents for `hostEvents`; allows for `events` | The author puts an event in `hostEvents` when a placer step must come first. |
| H2 | allows, by choice | The fix is a gate in the fragment. |
| H3 | prevents | Exits are not events; replies are produced only by the bound request. |
| H4 mislabelled results | prevents | Brands: `success` only from `reply.success`, tags only from `reply.failures.*`; unknown, interrupt, defect, not-sent are runtime-owned. |
| H5 interrupt as not sent | prevents | `Unapplied` is reachable only from `NotSent`/`Cancel`; `Interrupted` carries an Attempt and ends `Uncertain` (rule 18, example test). |
| D1 | prevents | Reads are open, so nothing is copied. Derived `error` is computed in `initial` and `Set` together. |
| D2 | prevents | The request is frozen in memory at start; the host select sees `{ payload }` only (type). |
| D3 | allows in general; AutoSave's shape avoids it; `flow check` warns on cycles | Saves start only from `DIRTY`; a server value never enters `DIRTY` from `PLAIN`. Check 20 reports operation, reply, memory, schedule, callback cycles. |
| D4 | prevents | Success and failure tags map exhaustively (Operations O2); the rest is runtime-owned; every exit must be mapped (type). |
| D5 restore in flight | prevents, once Persistence is amended | Generation persisted; a restored call is answered `NotSent` or `Unknown`; a restored read is answered `Interrupted`. |
| D6 same-turn seeding | prevents when data comes by payload; allows a stale read of a key the same transition writes | `S.X.with(({ memory, payload }) => ...)` reads the pre-turn snapshot plus the payload (rule 9). |
| D7 drafts lost | prevents on exits (type: abnormal exits declare the draft); allows on abandonment | The host's leaving handler reads the fragment's memory (rule 16) and decides. |
| A1 | prevents at the host; allows inside a fragment that wraps children | The host forwards nothing. A wrapper declares one event and one `.from` line per input it re-exposes. |
| A2 | partly prevents | Fragment side: one `contract` block, requests declare replies in place. Host side: `props`, `on`, `exits`, `abandoned` share one state node, but nothing links them syntactically. |
| A3 | prevents | Separate constructors, separate rules. |
| A4 | prevents | `gate` replaces `guard()`; `.with` replaces `.start(input)`; `input` and `events` keep their meaning. `P` and `props` differ by phase. |
| A5 | prevents | Fragments call callbacks and requests only. |
| A6 | prevents | Unbound required ports, unmapped exits, missing `success` and missing `abandoned` fail type check or `flow check`. |
| T1 partial turns | prevents | One composed turn; any declined part declines all; terminal deliveries are total (rule 10); `check` evaluates the same composition. |
| T2 schedule baseline traps | prevents by check, not by type | Check 18 warns when a `restartOn` schedule is in a state entered by the transition that changes its selection. |

## 5. `flow check` and `flow graph`

Errors:

1. Everything a type error also catches, for untyped callers: unbound required port, unmapped exit, unknown name, payload mismatch (`also`, exits, `.with`, replies), `success` unmapped, wrong brand, an outside send of a `hostEvent` or nested event.
2. A request binding that does not return exactly one operation, reads more than `{ payload }`, or binds a descriptor that is not `serialize`/`cancel`; a commit binding without `abandoned`.
3. A state a call site targets that does not handle every reply of that request kind; a call site reachable while a call is outstanding.
4. Terminal totality: `also` reachable from a reply, exit or timer handler targets a guarded, gated or non-total command.
5. Composed turn with two state changers; `also` cycle.
6. `also` placement: at the host only into `hostEvents`; inside a fragment only direct children; never into a subroutine's event from outside that subroutine's state.
7. Subroutine with `input` or `start` on the initial or default path; transition targeting an inner state from outside.
8. Subroutine with no exits and no host transition that leaves its state or an ancestor (L4).
9. Trait with states or embedding a subroutine; a callback target outside the placement node.
10. Name collisions or reserved names across instance, state, memory, event, prop and reply-event names; path over ten segments.
11. An abnormal exit of a subroutine that owns a declared draft but carries none.

Warnings:

17. Event neither public nor reached by any `also`; exit never taken; callback never called; gate on no transition; value prop never read.
18. `restartOn` schedule in a state entered by the transition that changes its selection (T2).
19. Stuck or unreachable states inside a fragment (existing check, run per fragment); a reply handled in no state.
20. Feedback cycle: callback, operation, reply, memory, `restartOn`, schedule, callback (D3).
21. A trait callback handler whose target leaves a state while the trait holds a schedule.
22. A transition entering a subroutine with a commit binding that has no guard, when a sibling `abandoned` handler writes pending state (L7).

Info: defaults in use; which events are public; deny codes per event.

Not claimed (undecidable): whether an `abandoned` handler reconciles correctly; whether a host guard is right; whether a rule function is semantically right.

`flow check` also runs each fragment alone (every exit reachable from `start` using only declared events,
replies and schedules) when a Story references it.

`flow graph`: a subroutine is a cluster with its inner states; exits are labelled edges to host targets; each
`also` is an edge; callbacks are dotted edges to host actions; requests are edges to the bound operation and back
as replies, with `abandoned` edges dashed; gates show deny codes; traits are boxes with schedules; public versus
placer-only events are marked.

## 6. Adds, removes, weaknesses

**Adds vs proposal.md:** `contract`, `hostEvents`, `also`, `start`, `S.X.with`, `request.commit/read` with
`reply`, `abandoned`, `gate`, `P`, `story.fragment` with `requests`/`replies`/`leave`/`setProps`. **Removes:**
`raise`, `exposes`, TS-generic props, forwarding, exits-as-events, bare payload copy, optional gates, the "first
send happens elsewhere" gap.

**Plan changes required:**
- Machines O3: construction-time composition of one turn from several handlers (`also`, `start`, exits, `abandoned`), with the ordering, decline and terminal-totality rules; a throwing result mapper ends its request with `Defect` instead of enqueuing nothing.
- Machines O1: namespaced fragment memory in the snapshot, path-addressed events in `E`, `payload` in handler context.
- Operations O2/O3: a bound request routes `NotSent`, `Unknown`, `Interrupted`, `Defect` to the fragment; a bound pre-invocation cancel answers `NotSent`; `reject` and `allow` are errors for bound commits; the rule that "state exit does not cancel finite work and its event reaches the later state" gets an exception: bound replies are fenced by generation and go to `abandoned`; `select` of a bound commit reads `payload` only; a second outstanding call per request rejects the turn.
- Persistence: persist the entry generation; restore answers `NotSent`/`Unknown` for commits and `Interrupted` for reads.
- Testing O3: scripted adapter fixtures bound to request props (no outcome injection).
- CommandLine O5: section 5.

**Honest weaknesses:**
- Composition is the biggest new machinery. It is a desugaring, but readers must learn it.
- `abandoned` is required on every commit binding. Hosts carry 6 to 9 lines each, even when no host path leaves, because exits and callback targets also depart.
- Public events at a path mean a UI can send a fragment's event without the host knowing. The author must classify each event (`events` vs `hostEvents`), a judgement no type can check.
- Exits remain verbose; the reply side is short.
- Nested reads still couple the UI to inner memory. A declared public-memory list would fix it for one more keyword.
- `S.X.with(f)` makes input route-specific; two routes into one subroutine repeat the supply (the `enterAddress` constant is the workaround).
- The new-submit guard after an abandoned commit is the host's (L7); `flow check` can only warn.
- Trait timers are not state-scoped; the cure is wrapping in a subroutine.
- The type spike (S1) must prove `.with`, the `reply` binding, `also` through nesting, brand checking of failure tags, and nullable-attempt narrowing infer without assertions. This is the likeliest place the design bends.

## 7. Possible cuts (for the user to decide)

Ranked by simplicity gained against what is lost, from the round 2 simplicity audit and its correctness check.
None is applied.

| # | Cut | Simplifies | Breaks | Reopens (including losses the correctness check says were understated) |
| --- | --- | --- | --- | --- |
| 1 | `request.read` | one request kind, read restore, the Poll states | Poll refreshing through a request; verify steps that own their refresh reply | D4 for reads; **D5** (a pending read at restore strands its waiting state); **H3/H4 for reads** (a host-mapped read outcome can fake `Verified`/`Ready`); L2 for reads. Poll falls back to a plain callback and can stack refetches. |
| 2 | `P` as a separate token namespace (use `props` for tokens and values) | one word | nothing | A4 clarity only. |
| 3 | Subroutine inside subroutine | nested exits, nested generations, nested `abandoned` routing, `E.REVIEW` wiring | composite steps (wizard > address > confirm) | prior-art D1 (rebuild composites by hand); A1 inside composites. A small correctness gain: it removes the enclosing-exit leave path. |
| 4 | `also` (same-turn composition) | checks 4 to 6, a Machines O3 change, the decline and totality rules | SettledField, AddressStep, Catalogue; a host feeding a fragment | A1, E4/H1; **D3** (no host route for confirmed replacements of fragment-owned values). |
| 5 | Requests entirely (host maps outcomes onto fragment `hostEvents`, as in the round 0 draft) | the largest cut: `request`, `reply`, `abandoned`, `Unapplied`/`Uncertain` semantics, most plan amendments | fragment-owned retries, fenced replies, exhaustive outcome ownership | D2, D4, H3, H4, **H5**, L2, L5, L6, **L7**, **L8**, D5, A7. |
| 6 | Live value props (frozen `input` only) | 1 word, 1 rule | fragments that read changing host values (retry limits from a plan, pagination limits) | D1 (values pushed by `hostEvents` become copies). |
| 7 | `start` (the host's entering transition sends first) | 1 word, the default-path rule, a Machines O3 exception | self-contained first sends | A7, D2 (two places choose the request); **L8** (the host now issues the fragment's request, so the one-outstanding check spans two owners). |
| 8 | Forbid leaving a step with a commit outstanding (a static error unless the leaving transition cancels or the step is not sending) in place of `abandoned` | the whole abandoned protocol, its durable routes and host handlers | leaving mid-commit without waiting | **L4 fully for hung I/O** (an adapter that never settles leaves the actor unleavable; the audit's "partly" understates this); a post-invocation cancel still reports `unknown` and needs a route after the step is gone, so the protocol does not disappear. L7 does vanish. |
| 9 | Trait callback targets (callbacks never target) | rule 11's trait half | idle timeout to LOCKED, hold to DELETING from a trait | coverage only; the workaround is a subroutine. A mild correctness gain (fewer leave paths). |

Cuts 1, 2 and 9 have the best ratios (small, rarely used in the examples, contained loss). Cuts 3 and 8 are large
with nameable losses and deserve a deliberate decision. Cuts 4 and 5 remove the reason fragments exist.

## 8. Revision log (round 1)

Findings are from `round1-correctness.md` (C) and `round1-principles.md` (P).

**Fixed**

- C-B1 AutoSave never saved (restartOn baseline idle on entry). Removed `restartOn` from `DIRTY`; every `Edit` re-enters `DIRTY`. Added check 18 and T2.
- C-B2 Result tokens not bound to their operation. `reply` tokens exist only as the argument of a request binding returning exactly one operation.
- C-B3 / P-4 Mislabelled outcome kinds. `results` replaced with `request.commit/read`: the host maps success and named failure tags; the runtime owns the rest (division from opus-split and codex).
- C-B4 / C-M4 / L5 / L6 / D5. `abandoned` handler; pre-invocation cancel answered; generation persisted.
- C-M1 / D7. Abnormal exits carry drafts; host leaving handlers read fragment memory.
- C-M2 Checkout double order. `UNSURE` reconciles with `O.Orders.place.retry` on the stored Attempt.
- C-M3 / P-3 `start` used twice. Host form is `S.X.with(f)`.
- C-m1 / P-1 / E4 / A1 Forwarding. `forward` and the `accepts` spread dropped; `events`/`hostEvents` (opus-split).
- C-m3 / P-2 Bare payload copy removed.
- P-5 Composed parts read the pre-turn snapshot; data by payload.
- P-6 AutoSave got a host. P-9 / C-m4 Test token drift. P-10 Schema decode cost: dev and Stories only.
- Yardstick additions E4, L5, L6, H4, D5 to D7, T1, T2 added to the table.

**Rejected**

- P-7 Merge `P` tokens and `props` values. Different phases; one name for both is the A4 overload.
- C-m2 (spread makes child names the host's API): moot once spreads were gone.
- A read `unknown`: reads have none (Operations O2).

## 9. Revision log (round 2)

Findings are from `round2-correctness.md` (C2), `round2-principles.md` (P2) and `round2-simplicity.md` (S2).

**Must-fix items, fixed**

- C2-B1 `SendInterrupted` re-placed an order after a possibly applied commit (H5). Split the replies: `SendNotSent` is guaranteed non-invocation and the only reply that licenses `Unapplied`; `SendInterrupted`, `SendUnknown` and `SendDefect` carry an Attempt and end `Uncertain` (borrowed from opus-split's `notSent`/`interrupt` split). A select defect before invocation is `NotSent`; a mapper or write defect after invocation is `Defect { attempt }`. The `Crashed` exit is gone (defect with an Attempt is uncertain). New test and rule 18.
- C2-M1 / P2 A duplicate call answered `Interrupted` corrupted the outstanding call (L8). Removed. A second call while one is outstanding now rejects the turn before publication; `reject` and `allow` concurrency are construction errors for bound commits (borrowed from codex-split and opus-split); no reply exists for an unadmitted call.
- C2-M2 `abandoned` covered host paths only. Now required on every commit binding, so own exits, enclosing exits and trait callback targets are covered with no path analysis (opus-single rule 23, codex-split). Old check 12 replaced by check 2.
- C2-M3 / L7 Departure gap. One handler runs in the departure turn with `outcome: "pending"` and the Attempt, then again on settlement (codex-split's `pending`); NoteEditor, Checkout and TicketEditor guard the new submit on it. Bound commits are `serialize` or `cancel`, so an older write cannot land last. Check 22 warns when no guard exists.
- E5 Abandoned handlers carry no `target` (type); rule 11 now keeps a callback target inside its placement node.
- P2 Whole-turn decline could lose a terminal delivery. Rule 10 and check 4: replies, exit continuations and timer firings are never declined (codex-split's total-raise rule, extended to timers).
- P2 Projection defects: a throwing select, mapper or write ends the call with `NotSent` or `Defect`.
- P2 Unmapped `success` left the fragment waiting: success is required; brands keep failure tags off `reply.success`; failure grouping by class borrowed from codex-split.
- P2 Testing O3 conflict unnamed: `replies` is now a scripted adapter fixture behind a synthetic binding, not outcome injection; stated in section 2.11 and the plan changes.
- P2 `abandoned` payload untyped: declared (`{ outcome, attempt }`, with the outcome list).
- P2 `request.read` had no example: Poll now uses it, with WAITING and REFRESHING so refreshes never stack (borrowed from the opus-split and codex Poll).
- P2 `"self"` as a state change: stated in rule 9 that it is not.
- Minors: D6 reworded ("prevents when data comes by payload"); optional gates removed, so a gate defaults to nothing (`() => true` is explicit); TicketEditor now has a `Reconcile` path using `O.Tickets.delete.retry`; Story samples define `Req` and `commit`; `canEdit: () => deny("Locked")` is a function; the depth row matches the ten-segment limit; keyword counts recomputed (24 declared plus 12 derived, was 26 declared); `StillUnknown` and similar use `{ target: "self" }`; a request key travels in the request (`subject`) since selects read `payload` only.
- New problems L7, H5, E5, L8 are in the table with honest verdicts (L7 allows a deliberate second submit unless the host guards it).

**Simplicity drops applied (S2, kept by the correctness check)**

- One `story.fragment` (kept).
- One optional form: `optional` removed entirely; every port is required and `{}` ignores a callback; only `default` remains on value props. This also met the condition that an optional gate must not default to allow.
- "Always `.from`" replaced by the plans' rule (bare only when payload-free).
- Rules 15 and 17 (schedule and trap advice) dropped from the numbered rules; check 18 stays (the required condition).
- Rule 7's default-path ban merged into check 7, which covers both `input` and `start`.
- `NotSent` and `Cancelled` merged into one exit, `Unapplied`, only after `NotSent` came to mean guaranteed non-invocation (the stated condition).
- Cross-proposal: one abandoned handler `{ outcome, attempt }` with synchronous `pending` and no target; one callback-target rule (a callback never leaves its placement node, narrowing trait callbacks inside steps); `also` at the host only into `hostEvents` (Confirm's Yes/No host wrappers removed from TicketEditor); one terminal-totality rule; type-mirroring checks collapsed into check 1; empty declarations are implied (explicit constructors, so Poll stays a subroutine).
- Counts: declared new spellings 26 to 24 (derived reply and outcome spellings 12); numbered rules 17 numbered plus about 8 scattered to 18 numbered with none scattered; error checks 16 to 11 groups.

**Not applied**

- `contract` wrapper made optional: kept required (it groups the outside surface, an A2 gain). The audit also called keeping it defensible.
- Feature cuts: not applied; they are listed in section 7 for the user.

**Rejected**

- None of the must-fix items. One S2 nuance: the audit proposed a single `optional` option with a default. I removed `optional` instead of unifying it, because `prop(..., { optional: false })` reads as the opposite of what it does and an explicit `{}`/`() => true` at the placement is clearer (A6).
