# Machine fragments, split shape: `trait()` and `subroutine()` (Opus proposal)

Status: research proposal, not accepted, revised after review rounds 1 and 2 (logs at the end). It
is evaluated against [principles.md](../principles.md), plus the problems the reviews added: E4,
A7, H4, D5, L5, L6, D6, D7, T1, T2, and in round 2 L7, H5, E5 and L8.
[proposal.md](../proposal.md) and the single-fragment proposal ([fragments.md](../../fragments.md),
D1–D13) are prior art. Where this file and a plan differ, the plan wins; section 13 lists the plan
changes needed.

Round 2 direction: this file keeps its surface (two constructors, three sender lists, one contract
table) and borrows **codex-split's request semantics**:

- a synchronous `pending` record on departure;
- total delivery of terminal results;
- a defect reply when an outcome mapper throws;
- per-call and per-arming identity;
- fixture-backed fragment Stories.

## 0. The idea in one paragraph

A **trait** is something the actor _has_; a **subroutine** is something the actor _goes into_.
"Trait" is meant as in Scala, where a trait carries state, not as a Rust or TypeScript interface.

Both kinds are written like a small definition and machine in one call, and both declare a
Schema-shaped **contract** of nine ports. The host fills every port in **one block per instance**.

Fillings and raises are **fused at construction** into ordinary transitions: one turn, pre-turn
reads, and **if any fused part declines, the whole transition declines**, so `check()` always
agrees with handling. Results that must not be lost are protected by a rule: a request result, an
exit continuation or a timer firing can never be declined by something it raises.

The main choices:

- The fragment decides who may send each event (`events`, `hostEvents`, `internalEvents`).
- Values are fixed on entry (`input`) or read live (`live`).
- I/O goes through typed `requests`. The host maps `success` and failure tags; the fragment maps
  `notSent`, `unknown`, `interrupt` and `defect`.
- A commit that outlives its activation reaches a required `abandoned` handler: once with
  `pending`, in the very turn the step is left, and once more when it settles.
- The host may always abandon a subroutine. Only exits _return_.

---

## 1. Kept, changed and dropped from prior decisions

| Prior decision | Verdict | Why |
| --- | --- | --- |
| D12/D13 two kinds | **keep** | It removes A3. Round 2 found every single-constructor proposal conceding the same split under one name; a name states the lifetime at a glance. |
| Inlining into one actor | **keep** | One mailbox, one turn, one snapshot. |
| D9 the host cannot reach inside | **keep** | |
| D1–D3 nesting, readable names | **keep** | Reads and sends use the same full path. |
| D10 policy only through declared guards | **keep, and make it hold** | Under D11 it did not hold (next row). |
| D11 only the host sends | **change** | **D10 and D11 contradict each other (E4):** a forwarding host can refuse `Release`. Each event's sender is now declared by the fragment author. |
| Value props | **change → `input` + `live`** | The question is "must it stay fixed for the activation?" Requests never read `live` for commits (D2). |
| Callbacks for I/O; host maps outcomes onto fragment events | **change → `requests`** | It closes H3, H4, A7 and D4, and the outcome division by request kind closes H5. |
| Callbacks targeting host states | **one rule** | A callback filling targets only states inside the fragment's own placement node (from opus-single). |
| D5/D7 exits | **keep** | |
| L4 left open | **decide: abandon** | A transition from a composite's boundary preempts its substates (Harel, UML). |
| Late events keyed by full name | **change → `abandoned`** | From codex-single and codex-split: required, non-targeting, with a synchronous `pending`. |
| Combined guard order; injected guards | **drop** | Fusion has a fixed order. |
| `events: "internal"`; `embeds`, `props`, `prop`, `callback`, `guard()` | **drop / rename** | |
| Separate definition and machine halves per fragment | **not applied** | A fragment is one call; the host definition reads only its contract (bundle cost only). |

---

## 2. The contract: nine ports

| Port | Fragment declares | Fragment uses | Host fills, in the instance's block | Question |
| --- | --- | --- | --- | --- |
| **input** | `input: { start: Schema.String }` | `initial({ input })` | `input: ({ memory, context, event }) => …` | what is fixed at entry? |
| **live** | `live: { slow: Schema.Boolean }` | `({ live })` in guards, updates, action parameters, schedule durations, read requests' input | `live: { slow: ({ memory, context, activities }) => … }` | what must it see as it changes? |
| **events** | `events: { Changed: { value } }` | `on` | nothing: anyone may send it at the full path | sent by anyone |
| **hostEvents** | `hostEvents: { Set: { value } }` | `on` | `raise: [E.title.Set.from(…)]` | sent only by my host |
| **internalEvents** | `internalEvents: { Due: {} }` | `on` | nothing | sent only by me |
| **guards** | `guards: ["canEdit"]` | `guard: guards.canEdit` | `guards: { canEdit: (i) => … \|\| deny("Locked") }` | where may the host say no? |
| **callbacks** | `callbacks: { onChanged: { value } }` | `actions: [callbacks.onChanged.from(f)]` | `{ target?, updateMemory?, actions?, raise? }` | what should the host hear? |
| **requests** | `requests: { send: { kind: "commit", input, success: { Done: {} }, failure: { Busy: {} } } }` | `actions: [requests.send]`; one `outcomes` map | `send: { operation: ({ results }) => O.x.commit(({ payload }) => …, { outcomes }), abandoned: { … } }` | what I/O, and what comes back? |
| **exits** (subroutines) | `exits: { Done: { address } }` | `target: exits.Done` / `exits.Done.from(f)` | `exits: { Done: S.REVIEW \| { target, updateMemory?, actions? } }` | how can it finish? |

Every port is **required**; `{}` is the explicit "ignore", except for `abandoned`, which may not be
empty. Every shape is a Schema field record. Guards and selectors are inferred TypeScript
functions.

The machine's `E` also carries tokens for its direct children's `hostEvents`, for use in `raise`.
The definition's `E`, which the UI imports, does not.

---

## 3. Rules

1. **Placement.** Traits go in `traits` (root of the host or of an enclosing fragment); subroutines
   go in `states` as `{ NAME: Sub }`. The types refuse the other placement. Instance names are
   unique per actor and differ from host memory keys.

2. **Activation.** A root trait activates with the actor. A trait inside a fragment activates with
   that fragment. A subroutine activates on every entry to its state.
   - On activation, `input` is read, then `initial` runs, then children activate (parents first),
     then schedules arm.
   - `input` reads the **staged** snapshot (after the entering transition's updates) plus that
     transition's `event`, where an exit's payload counts as the event.
   - At admission (a root trait, or a subroutine on a default path), `input` reads the host's
     initial memory and context, and `event` is `undefined`.
   - Leaving removes memory and stops schedules.
   - Each request call carries its **call id** (activation, request, sequence), and each schedule
     firing carries its **arming id** (borrowed from codex-split). A result or firing whose id is
     no longer current is not delivered to the fragment.
   - Nothing re-activates on restore.

3. **Entering.** From outside, only the subroutine's own state is targetable. Its `start: [...]`
   actions are appended to every transition that enters it, and read the fresh fragment memory.
   `start` is forbidden on a default path, because admission is not a transition.

4. **Returning and abandoning.**
   - A subroutine returns only by taking an exit. The block maps every exit, with no guards.
   - Inside a fragment, a child's exit filling may target one of the fragment's own states, or one
     of its own exits (`exits.Kept`, `exits.Failed.from(f)`).
   - Any host transition may abandon a subroutine; no exit is taken.

5. **Events.** Host and fragment handle disjoint event sets. Public `events` are reachable from
   outside at the full path, and only declared guards refuse them. `internalEvents` come only from
   the fragment's schedules and request outcomes.

6. **Callbacks.** A callback filling may update host memory, run actions, raise, and target a state
   inside the fragment's own placement node. It has no guards. `"self"` is not a target.

7. **Requests.**
   - **Kind and results.** A request is a `"commit"` or a `"read"`, with one `success` result and
     named `failure` results.
   - **Input.** It is computed in one place, from fragment memory (plus `live` for reads). The
     host's select receives **only `payload`**, so a commit's key lives in the request Schema.
   - **Fragment outcomes.** The fragment maps every result, plus `notSent`, `unknown`, `interrupt`
     and `defect` for commits, or `interrupt` and `defect` for reads.
     - `notSent` means guaranteed never invoked: a `reject`, a cancel before invocation, or a
       restore that was never invoked.
     - `interrupt` makes no such promise. It carries the Attempt, as `unknown` does.
     - An outcome mapper that throws (the host's `results.X.from` or the fragment's `outcomes`)
       records an issue and delivers `defect` without calling another mapper (borrowed from
       codex-split).
   - **Host mapping.** The host maps `success` only onto the success token, and each failure tag
     only onto failure tokens. The tokens exist only as the argument of that `operation` function.
   - **Calls.** At most one outstanding call per request per activation. A second call is a
     pre-publication turn rejection.
   - **Relay.** A middle fragment relays a child's request by filling it with its own request
     token. Kind, success and failure must match.

8. **Abandoned commits** (from codex-split, with one handler shape). Each commit filling requires a
   non-empty `abandoned: { updateMemory?, actions? }`, with
   `payload: { outcome: "pending" | "success" | "failure" | "notSent" | "unknown" | "interrupt" | "defect", attempt }`.
   - If a call is outstanding when its activation ends (abandoned, re-entered, or left by an exit
     of an enclosing fragment), `abandoned` runs **with `"pending"` fused into that leaving
     transition**.
   - It runs once more with the terminal outcome as a later host turn.
   - It never targets, raises or calls callbacks.
   - It belongs to the host that binds the operation, through any relays.
   - The record is durable: restore converts it to the same route.

9. **Guards.** A guard is a function, a declared guard token, or an array of these that must all
   pass, with the first denial reported. Host guard fillings receive the host's pre-turn inputs
   plus the fragment's `event`. Inside fragment code, `state` is typed as the fragment's own
   leaf-path union. `check()` reads the same inputs, including any `live` selector, which may read
   activity lanes.

10. **One turn.**
    - **Fusion.** A transition, the fillings it calls and the child handlers it raises compile into
      one transition.
    - **Raise.** A raise targets a direct child's `hostEvents`, and only a child that is active
      before and after the transition. The raise graph must be acyclic. At most one fused part
      targets a state (`"self"` does not count).
    - **Guards.** All guards run on the pre-turn snapshot and payloads; `check()` evaluates raise
      payload mappers to do so. If any declines, or a raised event is unhandled, the **whole**
      transition declines, and `check()` reports that code.
    - **Order.** Updates run in order (own, fillings, raised handlers), then action parameters.
      The only staged reads are `input` and `start` (rules 2–3), and they apply only to fresh
      activations.
    - **Terminal totality** (borrowed from codex-split). A raise reachable from a request-result
      handler, an exit filling or a timer-fired handler must target a `hostEvent` the child handles
      unguarded at its root or in every leaf. So a consumed delivery can never be declined and lost.
    - **Publication.** One batch validates, then one publication.

11. **Reading and limits.** Anyone may read fragment memory and states. A subroutine's slice is
    `undefined` outside its state. Only the fragment writes them. Fragments declare no
    `operations`, `context`, `onContext`, `send`, `activities` or persistence.

---

## 4. What is fused where

| Fragment writes | Host fills | Compiled as |
| --- | --- | --- |
| `guard: guards.canEdit` | `canEdit: fn` | `guard: fn` on that transition |
| `({ live }) => …` | `live.x: sel` | `sel` on the pre-turn snapshot |
| `actions: [callbacks.onX.from(f)]` | `onX: { target?, updateMemory, actions, raise }` | the same transition, extended |
| `actions: [requests.send]`, `start` | `send.operation` | `O.op.commit(sel(payload), …)`, with outcomes routed through the fragment's map and checked against the call id |
| any transition leaving an activation with a commit outstanding | `send.abandoned` | that transition, plus `abandoned({ outcome: "pending", attempt })` |
| `target: exits.Done` | `Done: { target, … }` | `target` plus the filling's updates and actions |
| `raise: [E.child.Set.from(f)]` | n/a | the child's handler, fused into the same transition |

---

## 5. Keywords

| Kind | Words |
| --- | --- |
| **New** (~22) | `trait`, `subroutine`, `traits`, `live`, `hostEvents`, `guards` (declaration and filling; the existing per-transition `guard` is unchanged), `callbacks`, `requests`, `kind` (`"commit"` / `"read"`), `operation`, `results` (token argument), `notSent`, `abandoned` with `outcome` / `attempt` / `"pending"`, `exits`, `start`, `raise`, `payload` (data a fragment hands across), `story.fragment`, Story `cancel` |
| **Existing in the plans** | `definition`, `machine`, `states`, `events`, `internalEvents`, `input`, `memory`, `initial`, `operations`, `default`, `on`, `target`, `"self"`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `activities`, `context`, `outcomes`, `success`, `failure`, `unknown`, `interrupt`, `defect`, `.from`, `deny`, `check`, `S`, `E`, `O`, `Attempt`, `commit`, `retry`, `lookup`, `refetch`, `subscribe`, `useView`, `send`, `story`, `process`, `advance`, `checkpoint` |
| **Author-chosen** | `Debounce`, `Field`, `Confirm`, `CommitWithRetry`, `Poll`, `HoldToConfirm`, `AddressStep`, `DeleteFlow`, `settle`, `ASK`, `onSettled`, `onHeld`, `canEdit`, `send`, `verify`, `remove`, `Done`, `Busy`, … |

---

## 6. Full examples

`TicketsDomain`, `AuthDomain`, `OrdersDomain`, `AddressesDomain` and `MaintenanceDomain` are
operation handles declared elsewhere.

### 6.1 The fragments

```ts
// fragments.ts
import { trait, subroutine, deny, Attempt } from "flow-state";
import { Duration, Schema } from "effect";

// ── Debounce (trait): tells its host once, `wait` after the last Input ──────────────
// T2: the baseline is taken at activation, and only Input changes seq.
export const Debounce = (p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      hostEvents: { Input: {} },
      internalEvents: { Due: {} },
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
        Due: { target: "self", actions: [callbacks.onSettled] },
      },
    }),
  );

// ── Field (trait): a validated value; the user edits it, the host may set it ────────
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      input: { start: value },
      events: { Changed: { value }, Blurred: {} },
      hostEvents: { Set: { value } },
      memory: { value, touched: Schema.Boolean, error: Schema.NullOr(Schema.String) },
      initial: ({ input }) => ({ value: input.start, touched: false, error: p.validate(input.start) }),
      guards: ["canEdit"],
      callbacks: { onChanged: { value } },
    },
    ({ guards, callbacks }) => ({
      on: {
        Changed: {
          target: "self",
          guard: guards.canEdit,
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
          actions: [callbacks.onChanged.from(({ event }) => ({ value: event.value }))],
        },
        Blurred: { target: "self", updateMemory: () => ({ touched: true }) },
        Set: {
          target: "self",                            // unguarded and no callback: total, and not an edit (D3)
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
        },
      },
    }),
  );
export const isValid = (f: { error: string | null }) => f.error === null;
export const visibleError = (f: { touched: boolean; error: string | null }) =>
  f.touched ? f.error : null;

// ── HoldToConfirm (trait): fires onHeld after a continuous hold ─────────────────────
// Release is public: no host can refuse or drop it (E1, E4). The arming id means a firing
// queued before a re-press cannot confirm early.
export const HoldToConfirm = (p: { hold: Duration.Input }) =>
  trait(
    {
      id: "HoldToConfirm",
      events: { Press: {}, Release: {} },
      internalEvents: { Held: {} },
      memory: { pressing: Schema.Boolean, presses: Schema.Int },
      initial: () => ({ pressing: false, presses: 0 }),
      guards: ["canPress"],                           // only Press may be refused
      callbacks: { onHeld: {} },
    },
    ({ E, guards, callbacks }) => ({
      schedules: {
        held: { schedule: p.hold, send: E.Held, restartOn: ({ memory }) => memory.presses },
      },
      on: {
        Press: {
          target: "self",
          guard: [guards.canPress, ({ memory }) => !memory.pressing || deny("AlreadyPressed")],
          updateMemory: ({ memory }) => ({ pressing: true, presses: memory.presses + 1 }),
        },
        Release: { target: "self", updateMemory: () => ({ pressing: false }) },
        Held: [
          {
            target: "self",
            guard: ({ memory }) => memory.pressing || deny("Released"),
            updateMemory: () => ({ pressing: false }),
            actions: [callbacks.onHeld],
          },
          { target: "self" },                         // unguarded fallback: the firing is consumed
        ],
      },
    }),
  );

// ── Confirm (subroutine) ─────────────────────────────────────────────────────────────
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

// ── CommitWithRetry (subroutine): sends the confirmed request; retries only on Busy or
//    notSent, never on unknown, interrupt or defect (H5) ──────────────────────────────
export const CommitWithRetry = <F extends Schema.Struct.Fields>(
  request: F,
  p: { maxRetries: number; backoff: Duration.Input },
) =>
  subroutine(
    {
      id: "CommitWithRetry",
      input: { request: Schema.Struct(request) },
      states: ["SENDING", "BACKOFF"],
      internalEvents: {
        Sent: {},
        Busy: {},
        Rejected: { reason: Schema.String },
        Unsure: { attempt: Attempt },
        Retry: {},
      },
      memory: { request: Schema.Struct(request), attempts: Schema.Int },
      initial: ({ input }) => ({ request: input.request, attempts: 0 }),
      requests: {
        send: {
          kind: "commit",
          input: request,
          success: { Done: {} },
          failure: { Busy: {}, Rejected: { reason: Schema.String } },
        },
      },
      exits: {
        Done: {},
        GaveUp: {},
        Rejected: { reason: Schema.String },
        Uncertain: { attempt: Attempt },
      },
    },
    ({ S, E, requests, exits }) => ({
      default: S.SENDING,
      start: [requests.send],
      requests: {
        send: {
          input: ({ memory }) => memory.request,
          outcomes: {
            Done: E.Sent,
            Busy: E.Busy,
            Rejected: E.Rejected.from(({ reason }) => ({ reason })),
            notSent: E.Busy,
            unknown: E.Unsure.from((attempt) => ({ attempt })),
            interrupt: E.Unsure.from((attempt) => ({ attempt })),
            defect: E.Rejected.from(() => ({ reason: "Unexpected error" })),
          },
        },
      },
      states: {
        SENDING: {
          on: {
            Sent: exits.Done,
            Rejected: exits.Rejected.from(({ event }) => ({ reason: event.reason })),
            Unsure: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })),
            Busy: [
              {
                target: S.BACKOFF,
                guard: ({ memory }) => memory.attempts < p.maxRetries || deny("NoRetriesLeft"),
                updateMemory: ({ memory }) => ({ attempts: memory.attempts + 1 }),
              },
              exits.GaveUp,                               // unguarded fallback: total
            ],
          },
        },
        BACKOFF: {
          schedules: {
            retry: {
              schedule: ({ memory }) => Duration.times(p.backoff, 2 ** (memory.attempts - 1)),
              send: E.Retry,
            },
          },
          on: { Retry: { target: S.SENDING, actions: [requests.send] } },
        },
      },
    }),
  );

// ── Poll (subroutine): refreshes a keyed read until its host leaves; slower while `slow` ─
export const Poll = <K extends Schema.Struct.Fields>(
  key: K,
  p: { every: Duration.Input; slowEvery: Duration.Input; maxBackoff: Duration.Input },
) =>
  subroutine(
    {
      id: "Poll",
      input: { key: Schema.Struct(key) },             // fixed for the activation
      live: { slow: Schema.Boolean },                 // read when WAITING arms its tick
      states: ["WAITING", "REFRESHING"],
      internalEvents: { Tick: {}, Ok: {}, Failed: {} },
      memory: { key: Schema.Struct(key), failures: Schema.Int },
      initial: ({ input }) => ({ key: input.key, failures: 0 }),
      requests: { refresh: { kind: "read", input: key, success: { Ok: {} }, failure: { Failed: {} } } },
    },
    ({ S, E, requests }) => ({
      default: S.WAITING,
      requests: {
        refresh: {
          input: ({ memory }) => memory.key,
          outcomes: { Ok: E.Ok, Failed: E.Failed, interrupt: E.Failed, defect: E.Failed },
        },
      },
      states: {
        WAITING: {
          schedules: {
            tick: {
              schedule: ({ memory, live }) =>
                Duration.min(
                  Duration.times(live.slow ? p.slowEvery : p.every, 2 ** memory.failures),
                  p.maxBackoff,
                ),
              send: E.Tick,
            },
          },
          on: { Tick: { target: S.REFRESHING, actions: [requests.refresh] } },
        },
        REFRESHING: {
          on: {
            Ok: { target: S.WAITING, updateMemory: () => ({ failures: 0 }) },
            Failed: { target: S.WAITING, updateMemory: ({ memory }) => ({ failures: memory.failures + 1 }) },
          },
        },
      },
    }),
  );
```

### 6.2 Debounce: a search box

New keywords used: `traits`, `hostEvents`, `callbacks`, `raise`. A single debounce could also be a
host schedule with `restartOn` (Machines O5); it becomes a fragment once a second machine needs it.

```ts
// ticket-search.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Debounce } from "./fragments";

export const TicketSearch = definition({
  id: "Desk/TicketSearch",
  states: ["READY"],
  traits: { settle: Debounce({ wait: "300 millis" }) },
  events: { QueryChanged: { query: Schema.String } },
  input: { workspaceId: Schema.String },
  memory: { workspaceId: Schema.String, query: Schema.String, settled: Schema.String },
  initial: ({ input }) => ({ workspaceId: input.workspaceId, query: "", settled: "" }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-search.machine.ts
import { machine } from "flow-state";
import { TicketSearch } from "./ticket-search.definition";

export const TicketSearchMachine = machine(TicketSearch, ({ S, E, O }) => ({
  default: S.READY,
  traits: {
    settle: {
      callbacks: {
        onSettled: { updateMemory: ({ memory }) => ({ settled: memory.query }) },
      },
    },
  },
  on: {
    QueryChanged: {
      target: "self",
      updateMemory: ({ event }) => ({ query: event.query }),
      raise: [E.settle.Input],                  // fused; neither part targets a state
    },
  },
  states: {
    READY: {
      activities: {
        results: O.Tickets.search.subscribe(({ memory }) => ({
          workspaceId: memory.workspaceId,
          query: memory.settled,
        })),
      },
    },
  },
}));
```

```tsx
// SearchBox.tsx
export function SearchBox({ search }: { search: Actor<typeof TicketSearchMachine> }) {
  const query = useView(search, (s) => s.memory.query);
  const results = useView(search, (s) => s.activities.results?.data ?? []);
  return (
    <>
      <input
        value={query}
        onChange={(e) => search.send(TicketSearch.E.QueryChanged({ query: e.target.value }))}
      />
      {/* search.send(TicketSearch.E.settle.Input())  ← type error: a hostEvent */}
      <TicketList tickets={results} />
    </>
  );
}
```

### 6.3 A validated field: sign-up

New keywords used: `traits`, `input`, `guards`, `callbacks`. The root traits' `input` is read at
admission from the host's initial memory.

```ts
// signup.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Field } from "./fragments";

export const Signup = definition({
  id: "Auth/Signup",
  states: ["FILLING", "SUBMITTING", "DONE"],
  traits: {
    email: Field(Schema.String, { validate: (v) => (v.includes("@") ? null : "Not an email") }),
    password: Field(Schema.String, {
      validate: (v) => (v.length >= 12 ? null : "At least 12 characters"),
    }),
  },
  events: { Submit: {} },
  internalEvents: { Created: {}, Rejected: { reason: Schema.String } },
  memory: { error: Schema.NullOr(Schema.String) },
  initial: () => ({ error: null }),
  operations: { Auth: AuthDomain },
});
```

```ts
// signup.machine.ts
import { machine, deny } from "flow-state";
import { Signup } from "./signup.definition";
import { isValid } from "./fragments";

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  const createUser = O.Auth.createUser.commit(
    ({ memory }) => ({ email: memory.email.value, password: memory.password.value }),
    {
      outcomes: {
        success: E.Created,
        failure: { EmailTaken: E.Rejected.from(() => ({ reason: "That email is registered" })) },
        unknown: E.Rejected.from(() => ({ reason: "The account may have been created; try signing in" })),
        interrupt: E.Rejected.from(() => ({ reason: "Interrupted; try signing in before retrying" })),
        defect: E.Rejected.from(() => ({ reason: "Something went wrong" })),
      },
    },
  );

  return {
    default: S.FILLING,
    traits: {
      email: {
        input: () => ({ start: "" }),
        guards: { canEdit: ({ state }) => state === "FILLING" || deny("Submitting") },
        callbacks: { onChanged: { updateMemory: () => ({ error: null }) } },
      },
      password: {
        input: () => ({ start: "" }),
        guards: { canEdit: ({ state }) => state === "FILLING" || deny("Submitting") },
        callbacks: { onChanged: { updateMemory: () => ({ error: null }) } },
      },
    },
    states: {
      FILLING: {
        on: {
          Submit: {
            target: S.SUBMITTING,
            guard: ({ memory }) => (isValid(memory.email) && isValid(memory.password)) || deny("Invalid"),
            actions: [createUser],
          },
        },
      },
      SUBMITTING: {
        on: {
          Created: S.DONE,
          Rejected: { target: S.FILLING, updateMemory: ({ event }) => ({ error: event.reason }) },
        },
      },
      DONE: {},
    },
  };
});
```

```tsx
// SignupForm.tsx
export function SignupForm({ signup }: { signup: Actor<typeof SignupMachine> }) {
  const email = useView(signup, (s) => s.memory.email);
  const emailError = useView(signup, (s) => visibleError(s.memory.email));
  const canSubmit = useView(signup, (s) => check(s, Signup.E.Submit())._tag === "Allowed");
  const error = useView(signup, (s) => s.memory.error);
  return (
    <form onSubmit={(e) => { e.preventDefault(); signup.send(Signup.E.Submit()); }}>
      <input
        value={email.value}
        onChange={(e) => signup.send(Signup.E.email.Changed({ value: e.target.value }))}
        onBlur={() => signup.send(Signup.E.email.Blurred())}
      />
      {emailError && <p>{emailError}</p>}
      {/* password input: same, with Signup.E.password.* */}
      {/* signup.send(Signup.E.email.Set({ value: "x" }))  ← type error: a hostEvent */}
      <button disabled={!canSubmit}>Create account</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

### 6.4 A confirm step and a commit-with-retry step: deleting a ticket

New keywords used: `exits`, `requests`, `operation`, `results`, `payload`, `abandoned`.

```ts
// ticket-delete.definition.ts
import { definition, Attempt } from "flow-state";
import { Schema } from "effect";
import { CommitWithRetry, Confirm } from "./fragments";

export const TicketDelete = definition({
  id: "Desk/TicketDelete",
  states: [
    "VIEWING",
    { ASK: Confirm },
    { DELETING: CommitWithRetry({ ticketId: Schema.String }, { maxRetries: 3, backoff: "1 second" }) },
    "DELETED",
    "UNSURE",
  ],
  events: { Delete: {}, Dismiss: {} },
  input: { ticketId: Schema.String },
  memory: {
    ticketId: Schema.String,
    error: Schema.NullOr(Schema.String),
    attempt: Schema.NullOr(Attempt),
  },
  initial: ({ input }) => ({ ticketId: input.ticketId, error: null, attempt: null }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-delete.machine.ts
import { machine } from "flow-state";
import { TicketDelete } from "./ticket-delete.definition";

export const TicketDeleteMachine = machine(TicketDelete, ({ S, O }) => ({
  default: S.VIEWING,
  states: {
    VIEWING: { on: { Delete: { target: S.ASK, updateMemory: () => ({ error: null }) } } },
    ASK: {
      exits: { Confirmed: S.DELETING, Declined: S.VIEWING },
    },
    DELETING: {
      input: ({ memory }) => ({ request: { ticketId: memory.ticketId } }),
      requests: {
        send: {
          operation: ({ results }) =>
            O.Tickets.delete.commit(({ payload }) => ({ ticketId: payload.ticketId }), {
              outcomes: {
                success: results.Done,
                failure: {
                  TicketLocked: results.Busy,
                  TicketMissing: results.Rejected.from(() => ({ reason: "Already deleted" })),
                },
              },
            }),
          // DELETING has no leaving path while a call is out; the route is still required
          abandoned: {
            updateMemory: ({ payload }) =>
              payload.outcome === "failure" || payload.outcome === "notSent"
                ? { attempt: null }
                : { attempt: payload.attempt },
          },
        },
      },
      exits: {
        Done: S.DELETED,
        GaveUp: { target: S.VIEWING, updateMemory: () => ({ error: "The ticket is locked. Try later." }) },
        Rejected: { target: S.VIEWING, updateMemory: ({ payload }) => ({ error: payload.reason }) },
        Uncertain: { target: S.UNSURE, updateMemory: ({ payload }) => ({ attempt: payload.attempt }) },
      },
    },
    DELETED: {},
    UNSURE: { on: { Dismiss: S.VIEWING } },
  },
}));
```

```tsx
// DeleteTicket.tsx
export function DeleteTicket({ del }: { del: Actor<typeof TicketDeleteMachine> }) {
  const asking = useView(del, (s) => TicketDelete.S.ASK.is(s));
  const waiting = useView(del, (s) => TicketDelete.S.DELETING.BACKOFF.is(s));
  const attempts = useView(del, (s) => s.memory.DELETING?.attempts ?? 0);
  const error = useView(del, (s) => s.memory.error);
  if (asking)
    return (
      <Dialog>
        <button onClick={() => del.send(TicketDelete.E.ASK.Yes())}>Delete</button>
        <button onClick={() => del.send(TicketDelete.E.ASK.No())}>Keep</button>
      </Dialog>
    );
  return (
    <>
      <button onClick={() => del.send(TicketDelete.E.Delete())}>Delete ticket</button>
      {waiting && <p>Ticket is locked, retrying ({attempts})…</p>}
      {error && <p role="alert">{error}</p>}
      {/* del.send(TicketDelete.E.DELETING.Sent())  ← type error: internal */}
    </>
  );
}
```

### 6.5 A poll that runs until the host leaves

New keywords used: `live`, `requests`, `operation`. `Poll` has no `start`, so it may be the default
state. Its `input` is read at admission. `Pause` abandons it.

```ts
// queue.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Poll } from "./fragments";

export const Queue = definition({
  id: "Desk/Queue",
  states: [
    "PAUSED",
    {
      LIVE: Poll({ workspaceId: Schema.String }, {
        every: "5 seconds",
        slowEvery: "1 minute",
        maxBackoff: "5 minutes",
      }),
    },
  ],
  events: { Pause: {}, Resume: {}, Focused: {}, Blurred: {} },
  input: { workspaceId: Schema.String },
  memory: { workspaceId: Schema.String, focused: Schema.Boolean },
  initial: ({ input }) => ({ workspaceId: input.workspaceId, focused: true }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// queue.machine.ts
import { machine } from "flow-state";
import { Queue } from "./queue.definition";

export const QueueMachine = machine(Queue, ({ S, O }) => ({
  default: S.LIVE,
  activities: {
    list: O.Tickets.list.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId })),
  },
  on: {
    Focused: { target: "self", updateMemory: () => ({ focused: true }) },
    Blurred: { target: "self", updateMemory: () => ({ focused: false }) },
  },
  states: {
    PAUSED: { on: { Resume: S.LIVE } },
    LIVE: {
      input: ({ memory }) => ({ key: { workspaceId: memory.workspaceId } }),
      live: { slow: ({ memory }) => !memory.focused },      // no copy into Poll's memory (D1)
      requests: {
        refresh: {
          operation: ({ results }) =>
            O.Tickets.list.refetch(({ payload }) => payload, {
              outcomes: { success: results.Ok, failure: results.Failed },
            }),
        },
      },
      on: { Pause: S.PAUSED },                    // abandons Poll; a late refresh is not delivered
    },
  },
}));
```

```tsx
// QueueHeader.tsx
export function QueueHeader({ queue }: { queue: Actor<typeof QueueMachine> }) {
  const live = useView(queue, (s) => Queue.S.LIVE.is(s));
  const refreshing = useView(queue, (s) => Queue.S.LIVE.REFRESHING.is(s));
  const failures = useView(queue, (s) => s.memory.LIVE?.failures ?? 0);
  useEffect(() => {
    const onVisibility = () =>
      queue.send(document.hidden ? Queue.E.Blurred() : Queue.E.Focused());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [queue]);
  return live ? (
    <>
      {refreshing ? "Refreshing…" : failures > 0 ? `Retrying (failed ${failures}×)` : "Live"}
      <button onClick={() => queue.send(Queue.E.Pause())}>Pause</button>
    </>
  ) : (
    <button onClick={() => queue.send(Queue.E.Resume())}>Resume</button>
  );
}
```

### 6.6 Two levels: checkout wizard → address step → two fields

`AddressStep` contains two `Field` traits and a `verify` read. The wizard binds `verify` and the
`place` commit. A `Cancel` during PLACING records `pending` in the same turn. `Start` refuses a new
order until the old one is settled and reconciled (L7), and `Reconcile` resolves it either way.

```ts
// address-step.ts
import { subroutine, deny } from "flow-state";
import { Schema } from "effect";
import { Field, isValid } from "./fragments";

export const Address = Schema.Struct({ street: Schema.String, city: Schema.String });

const required = (v: string) => (v.trim() ? null : "Required");

export const AddressStep = subroutine(
  {
    id: "AddressStep",
    input: { address: Address },
    states: ["EDITING", "VERIFYING"],
    traits: {
      street: Field(Schema.String, { validate: required }),
      city: Field(Schema.String, { validate: required }),
    },
    events: { Next: {}, Back: {} },
    internalEvents: { Verified: { address: Address }, Problem: { reason: Schema.String } },
    memory: { problem: Schema.NullOr(Schema.String) },
    initial: () => ({ problem: null }),
    requests: {
      verify: {
        kind: "read",
        input: Address.fields,
        success: { Valid: { address: Address } },
        failure: { Invalid: { reason: Schema.String } },
      },
    },
    exits: { Done: { address: Address }, Back: { draft: Address } },
  },
  ({ S, E, requests, exits }) => ({
    default: S.EDITING,
    traits: {
      street: {
        input: ({ input }) => ({ start: input.address.street }),
        guards: { canEdit: ({ state }) => state === "EDITING" || deny("Verifying") },
        callbacks: { onChanged: { updateMemory: () => ({ problem: null }) } },
      },
      city: {
        input: ({ input }) => ({ start: input.address.city }),
        guards: { canEdit: ({ state }) => state === "EDITING" || deny("Verifying") },
        callbacks: { onChanged: { updateMemory: () => ({ problem: null }) } },
      },
    },
    requests: {
      verify: {
        input: ({ memory }) => ({ street: memory.street.value, city: memory.city.value }),
        outcomes: {
          Valid: E.Verified.from(({ address }) => ({ address })),
          Invalid: E.Problem.from(({ reason }) => ({ reason })),
          interrupt: E.Problem.from(() => ({ reason: "Could not verify the address. Try again." })),
          defect: E.Problem.from(() => ({ reason: "Something went wrong. Try again." })),
        },
      },
    },
    on: {
      Back: exits.Back.from(({ memory }) => ({
        draft: { street: memory.street.value, city: memory.city.value },   // D7: the draft survives
      })),
    },
    states: {
      EDITING: {
        on: {
          Next: {
            target: S.VERIFYING,
            guard: ({ memory }) => (isValid(memory.street) && isValid(memory.city)) || deny("Invalid"),
            actions: [requests.verify],
          },
        },
      },
      VERIFYING: {
        on: {
          Verified: exits.Done.from(({ event }) => ({ address: event.address })),
          Problem: { target: S.EDITING, updateMemory: ({ event }) => ({ problem: event.reason }) },
        },
      },
    },
  }),
);
```

```ts
// checkout.definition.ts
import { definition, Attempt } from "flow-state";
import { Schema } from "effect";
import { CommitWithRetry, Confirm } from "./fragments";
import { Address, AddressStep } from "./address-step";

export const Checkout = definition({
  id: "Shop/Checkout",
  states: [
    "CART",
    { ADDRESS: AddressStep },
    { REVIEW: Confirm },
    {
      PLACING: CommitWithRetry(
        { cartId: Schema.String, address: Address },
        { maxRetries: 2, backoff: "2 seconds" },
      ),
    },
    "RECONCILING",
    "PLACED",
    "UNSURE",
  ],
  events: { Start: {}, Cancel: {}, Reconcile: {} },
  internalEvents: { Reconciled: {}, NotPlaced: { reason: Schema.String }, StillUnclear: {} },
  input: { cartId: Schema.String },
  memory: {
    cartId: Schema.String,
    address: Address,
    error: Schema.NullOr(Schema.String),
    // an order attempt the actor no longer waits for, and what is known about it
    late: Schema.NullOr(
      Schema.Struct({ attempt: Attempt, status: Schema.Literal("Pending", "Placed", "Unclear") }),
    ),
  },
  initial: ({ input }) => ({
    cartId: input.cartId,
    address: { street: "", city: "" },
    error: null,
    late: null,
  }),
  operations: { Orders: OrdersDomain, Addresses: AddressesDomain },
});
```

```ts
// checkout.machine.ts
import { machine, deny } from "flow-state";
import { Checkout } from "./checkout.definition";

export const CheckoutMachine = machine(Checkout, ({ S, E, O }) => {
  // the guards on Reconcile ensure late is set before this runs
  const reconcile = O.Orders.place.retry(({ memory }) => memory.late!.attempt, {
    outcomes: {
      success: E.Reconciled,
      failure: {
        PaymentBusy: E.NotPlaced.from(() => ({ reason: "The order was not placed: payments were busy" })),
        StockChanged: E.NotPlaced.from(() => ({ reason: "The order was not placed: items changed" })),
      },
      unknown: E.StillUnclear,
      interrupt: E.StillUnclear,
      defect: E.StillUnclear,
    },
  });

  return {
    default: S.CART,
    states: {
      CART: {
        on: {
          Start: {
            target: S.ADDRESS,
            guard: ({ memory }) => memory.late === null || deny("PreviousOrderUnresolved"),   // L7
          },
          Reconcile: [
            {
              target: S.PLACED,
              guard: ({ memory }) => memory.late?.status === "Placed" || deny("NotKnownPlaced"),
              updateMemory: () => ({ late: null }),
            },
            {
              target: S.RECONCILING,
              guard: ({ memory }) => memory.late?.status === "Unclear" || deny("NothingToReconcile"),
              actions: [reconcile],
            },
          ],
        },
      },
      ADDRESS: {
        input: ({ memory }) => ({ address: memory.address }),
        requests: {
          verify: {
            operation: ({ results }) =>
              O.Addresses.verify.lookup(({ payload }) => payload, {
                outcomes: {
                  success: results.Valid.from((address) => ({ address })),
                  failure: { Undeliverable: results.Invalid.from((e) => ({ reason: e.message })) },
                },
              }),
          },
        },
        exits: {
          Done: { target: S.REVIEW, updateMemory: ({ payload }) => ({ address: payload.address, error: null }) },
          Back: { target: S.CART, updateMemory: ({ payload }) => ({ address: payload.draft }) },
        },
        on: { Cancel: S.CART },
      },
      REVIEW: {
        exits: { Confirmed: S.PLACING, Declined: S.ADDRESS },
        on: { Cancel: S.CART },
      },
      PLACING: {
        input: ({ memory }) => ({ request: { cartId: memory.cartId, address: memory.address } }),
        requests: {
          send: {
            operation: ({ results }) =>
              O.Orders.place.commit(({ payload }) => payload, {
                outcomes: {
                  success: results.Done,
                  failure: {
                    PaymentBusy: results.Busy,
                    StockChanged: results.Rejected.from(() => ({ reason: "Some items are no longer available" })),
                  },
                },
              }),
            abandoned: {
              updateMemory: ({ payload }) => {
                switch (payload.outcome) {
                  case "pending":                     // fused into the Cancel transition itself
                    return { late: { attempt: payload.attempt, status: "Pending" } };
                  case "success":
                    return { late: { attempt: payload.attempt, status: "Placed" } };
                  case "failure":
                  case "notSent":
                    return { late: null };
                  default:                            // unknown, interrupt, defect
                    return { late: { attempt: payload.attempt, status: "Unclear" } };
                }
              },
            },
          },
        },
        exits: {
          Done: S.PLACED,
          GaveUp: { target: S.REVIEW, updateMemory: () => ({ error: "Payments are busy. Try again." }) },
          Rejected: { target: S.REVIEW, updateMemory: ({ payload }) => ({ error: payload.reason }) },
          Uncertain: {
            target: S.UNSURE,
            updateMemory: ({ payload }) => ({ late: { attempt: payload.attempt, status: "Unclear" } }),
          },
        },
        on: { Cancel: S.CART },                   // abandons PLACING while the order is in flight
      },
      RECONCILING: {
        on: {
          Reconciled: { target: S.PLACED, updateMemory: () => ({ late: null }) },
          NotPlaced: { target: S.CART, updateMemory: ({ event }) => ({ late: null, error: event.reason }) },
          StillUnclear: S.UNSURE,
        },
      },
      PLACED: {},
      UNSURE: {
        on: {
          Reconcile: {
            target: S.RECONCILING,
            guard: ({ memory }) => memory.late !== null || deny("NothingToReconcile"),
            actions: [reconcile],
          },
        },
      },
    },
  };
});
```

```tsx
// AddressForm.tsx
export function AddressForm({ checkout }: { checkout: Actor<typeof CheckoutMachine> }) {
  const street = useView(checkout, (s) => s.memory.ADDRESS?.street);
  const city = useView(checkout, (s) => s.memory.ADDRESS?.city);
  const problem = useView(checkout, (s) => s.memory.ADDRESS?.problem);
  const verifying = useView(checkout, (s) => Checkout.S.ADDRESS.VERIFYING.is(s));
  const canNext = useView(checkout, (s) => check(s, Checkout.E.ADDRESS.Next())._tag === "Allowed");
  if (!street || !city) return null;
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
      {problem && <p role="alert">{problem}</p>}
      <button type="button" onClick={() => checkout.send(Checkout.E.ADDRESS.Back())}>Back</button>
      <button disabled={!canNext || verifying}>{verifying ? "Checking…" : "Next"}</button>
      {/* checkout.send(Checkout.E.ADDRESS.street.Set({ value: "x" }))  ← type error: AddressStep's hostEvent */}
    </form>
  );
}

// CartActions.tsx
export function CartActions({ checkout }: { checkout: Actor<typeof CheckoutMachine> }) {
  const late = useView(checkout, (s) => s.memory.late);
  const canStart = useView(checkout, (s) => check(s, Checkout.E.Start())._tag === "Allowed");
  return (
    <>
      {late?.status === "Pending" && <p>Your previous order is still being processed…</p>}
      {late && late.status !== "Pending" && (
        <button onClick={() => checkout.send(Checkout.E.Reconcile())}>Check previous order</button>
      )}
      <button disabled={!canStart} onClick={() => checkout.send(Checkout.E.Start())}>Checkout</button>
    </>
  );
}
```

**What the types and checks enforce here, and what is the host's code:**

- **Enforced:** `abandoned` must exist, runs with `pending` in the `Cancel` turn, and cannot move
  the actor. `PLACING` cannot retry after `unknown`/`interrupt`. A second `place` call cannot start
  while one is outstanding in the same activation.
- **Host code:** the `Start` guard that reads `late` (L7) and the reconcile flow. A host that
  ignores `late` can still place twice; section 8 labels it so.

### 6.7 Relay: a request through a middle fragment, and seeding from the event

`DeleteFlow` wraps `Confirm` and `CommitWithRetry` and relays the child's `send` to its own
`remove`. The list host binds `remove`, seeds `DeleteFlow` from the entering event (D6), and
receives `abandoned` for a commit started two levels down.

```ts
// delete-flow.ts
import { subroutine, Attempt } from "flow-state";
import { Schema } from "effect";
import { CommitWithRetry, Confirm } from "./fragments";

export const DeleteFlow = subroutine(
  {
    id: "DeleteFlow",
    input: { ticketId: Schema.String },
    states: [
      { ASK: Confirm },
      { SENDING: CommitWithRetry({ ticketId: Schema.String }, { maxRetries: 3, backoff: "1 second" }) },
    ],
    memory: { ticketId: Schema.String },
    initial: ({ input }) => ({ ticketId: input.ticketId }),
    requests: {
      remove: {
        kind: "commit",
        input: { ticketId: Schema.String },
        success: { Done: {} },
        failure: { Busy: {}, Rejected: { reason: Schema.String } },
      },
    },
    exits: { Deleted: {}, Kept: {}, Failed: { reason: Schema.String }, Uncertain: { attempt: Attempt } },
  },
  ({ S, requests, exits }) => ({
    default: S.ASK,                                       // Confirm has no input or start
    states: {
      ASK: { exits: { Confirmed: S.SENDING, Declined: exits.Kept } },
      SENDING: {
        input: ({ memory }) => ({ request: { ticketId: memory.ticketId } }),
        requests: { send: requests.remove },              // relay
        exits: {
          Done: exits.Deleted,
          GaveUp: exits.Failed.from(() => ({ reason: "The ticket is still locked" })),
          Rejected: exits.Failed.from(({ payload }) => ({ reason: payload.reason })),
          Uncertain: exits.Uncertain.from(({ payload }) => ({ attempt: payload.attempt })),
        },
      },
    },
  }),
);
```

```ts
// ticket-list.definition.ts
import { definition, Attempt } from "flow-state";
import { Schema } from "effect";
import { DeleteFlow } from "./delete-flow";

export const TicketList = definition({
  id: "Desk/TicketList",
  states: ["BROWSING", { REMOVING: DeleteFlow }],
  events: { Remove: { ticketId: Schema.String }, Escape: {} },
  memory: { notice: Schema.NullOr(Schema.String), late: Schema.NullOr(Attempt) },
  initial: () => ({ notice: null, late: null }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-list.machine.ts
import { machine } from "flow-state";
import { TicketList } from "./ticket-list.definition";

export const TicketListMachine = machine(TicketList, ({ S, O }) => ({
  default: S.BROWSING,
  states: {
    BROWSING: { on: { Remove: S.REMOVING } },
    REMOVING: {
      input: ({ event }) => ({ ticketId: event.ticketId }),       // the Remove that entered it
      requests: {
        remove: {
          operation: ({ results }) =>
            O.Tickets.delete.commit(({ payload }) => ({ ticketId: payload.ticketId }), {
              outcomes: {
                success: results.Done,
                failure: {
                  TicketLocked: results.Busy,
                  TicketMissing: results.Rejected.from(() => ({ reason: "Already deleted" })),
                },
              },
            }),
          abandoned: {
            updateMemory: ({ payload }) => {
              switch (payload.outcome) {
                case "pending":
                  return { late: payload.attempt, notice: "A delete you left is still finishing" };
                case "success":
                  return { late: null, notice: "Deleted" };
                case "failure":
                case "notSent":
                  return { late: null, notice: "Not deleted" };
                default:
                  return { late: payload.attempt, notice: "The delete may have happened" };
              }
            },
          },
        },
      },
      exits: {
        Deleted: { target: S.BROWSING, updateMemory: () => ({ notice: "Deleted" }) },
        Kept: S.BROWSING,
        Failed: { target: S.BROWSING, updateMemory: ({ payload }) => ({ notice: payload.reason }) },
        Uncertain: {
          target: S.BROWSING,
          updateMemory: ({ payload }) => ({ late: payload.attempt, notice: "The delete may have happened" }),
        },
      },
      on: { Escape: S.BROWSING },                                 // abandons, even while sending
    },
  },
}));
```

```tsx
// TicketRow.tsx
export function TicketRow({ list, ticketId }: { list: Actor<typeof TicketListMachine>; ticketId: string }) {
  const asking = useView(list, (s) => TicketList.S.REMOVING.ASK.is(s));
  const retrying = useView(list, (s) => TicketList.S.REMOVING.SENDING.BACKOFF.is(s));
  const attempts = useView(list, (s) => s.memory.REMOVING?.SENDING?.attempts ?? 0);
  const notice = useView(list, (s) => s.memory.notice);
  return (
    <>
      <button onClick={() => list.send(TicketList.E.Remove({ ticketId }))}>Remove</button>
      {asking && (
        <>
          <button onClick={() => list.send(TicketList.E.REMOVING.ASK.Yes())}>Confirm</button>
          <button onClick={() => list.send(TicketList.E.REMOVING.ASK.No())}>Keep</button>
        </>
      )}
      {retrying && <p>Locked, retrying ({attempts})…</p>}
      <button onClick={() => list.send(TicketList.E.Escape())}>Close</button>
      {notice && <p>{notice}</p>}
    </>
  );
}
```

### 6.8 A trait callback that moves the host: hold to wipe

New keywords used: none beyond 6.1. `onHeld` targets a host state; this is allowed because a root
trait's node is the host's root (rule 6).

```ts
// danger-zone.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { HoldToConfirm } from "./fragments";

export const DangerZone = definition({
  id: "Admin/DangerZone",
  states: ["ARMED", "WIPING", "WIPED"],
  traits: { hold: HoldToConfirm({ hold: "2 seconds" }) },
  events: {},
  internalEvents: { Wiped: {}, WipeFailed: { reason: Schema.String } },
  input: { workspaceId: Schema.String },
  memory: { workspaceId: Schema.String, error: Schema.NullOr(Schema.String) },
  initial: ({ input }) => ({ workspaceId: input.workspaceId, error: null }),
  operations: { Maintenance: MaintenanceDomain },
});
```

```ts
// danger-zone.machine.ts
import { machine, deny } from "flow-state";
import { DangerZone } from "./danger-zone.definition";

export const DangerZoneMachine = machine(DangerZone, ({ S, E, O }) => {
  const wipe = O.Maintenance.wipe.commit(({ memory }) => ({ workspaceId: memory.workspaceId }), {
    outcomes: {
      success: E.Wiped,
      failure: { Forbidden: E.WipeFailed.from(() => ({ reason: "Not allowed" })) },
      unknown: E.WipeFailed.from(() => ({ reason: "The wipe may have happened; reload to check" })),
      interrupt: E.WipeFailed.from(() => ({ reason: "The wipe may have happened; reload to check" })),
      defect: E.WipeFailed.from(() => ({ reason: "Something went wrong" })),
    },
  });
  return {
    default: S.ARMED,
    traits: {
      hold: {
        guards: { canPress: ({ state }) => state === "ARMED" || deny("Busy") },
        callbacks: { onHeld: { target: S.WIPING, actions: [wipe] } },   // the one target in the fused turn
      },
    },
    states: {
      ARMED: {},
      WIPING: {
        on: {
          Wiped: S.WIPED,
          WipeFailed: { target: S.ARMED, updateMemory: ({ event }) => ({ error: event.reason }) },
        },
      },
      WIPED: {},
    },
  };
});
```

```tsx
// WipeButton.tsx
export function WipeButton({ zone }: { zone: Actor<typeof DangerZoneMachine> }) {
  const pressing = useView(zone, (s) => s.memory.hold.pressing);
  const wiping = useView(zone, (s) => DangerZone.S.WIPING.is(s));
  return (
    <button
      disabled={wiping}
      onPointerDown={() => zone.send(DangerZone.E.hold.Press())}
      onPointerUp={() => zone.send(DangerZone.E.hold.Release())}       // never refusable
      onPointerLeave={() => zone.send(DangerZone.E.hold.Release())}
    >
      {pressing ? "Keep holding…" : "Hold to wipe"}
    </button>
  );
}
```

---

## 7. The open features, answered

1. **Leaving from outside (L4, L5, L7).** Any host transition abandons a subroutine.
   - Memory goes, schedules stop, and results and firings are no longer current.
   - An outstanding commit runs `abandoned` with `pending` **in the leaving turn**, so the host's
     guards see it immediately. It runs again at settlement.
   - Reconciling goes through an explicit host event (`O.x.retry(attempt)`), as in Checkout.
2. **Inputs through nesting (A1).** Public `events` are reachable at the full path. `hostEvents`,
   `input`, `live`, guards, callbacks and requests stop at each level. A request is relayed in one
   line, and its `abandoned` belongs to the binder.
3. **Endings and results.** Exits return typed payloads, mapped exhaustively in the block, and may
   chain to an enclosing fragment's exits. Request results return through the fragment's own
   `outcomes`.
4. **Required and optional.** Every port is required. `{}` is "ignore"; `abandoned` may not be
   empty. Optional data uses `Schema.optional`.
5. **Schema vs TS.** Schema for every declared shape; guards and selectors are inferred TypeScript.
6. **`raise` and same-turn ordering.** Rule 10.
7. **Operation results into fragments.**
   - **First send:** `start`.
   - **Retries:** request input comes from memory captured at entry, and selects read only
     `payload` (D2). Retries happen only on `Busy` or `notSent` (H5).
   - **Feedback loops (D3):** server values arrive as `hostEvents`.
   - **Exhaustiveness:** two maps.
   - **Silent admission (L6):** answered as `notSent`.
   - **Mapper defects:** answered as `defect`.
   - **Restore (D5):** an acknowledged in-flight commit restores as `unknown`, a never-invoked one
     as `notSent`, and a pending read as `interrupt`. All go to the persisted activation, or to
     `abandoned` if that activation is gone.
   - **Phantom replies (L8):** results carry their call id.
8. **Testing alone: fixtures, no injection** (from codex-split and sonnet-single).
   `story.fragment(f, { id, input, live, guards, requests })` builds a harness host:
   - It places `f`, binds each request to a generated transaction or resource whose service is the
     given fixture function, `(payload, { attempt }) => Effect`, and fills `abandoned` itself.
   - Outcomes arise through real paths: success, tagged failure, `Effect.die` (defect),
     `Effect.interrupt` (interrupt), and `.cancel(request)` on a held fixture. That last one is the
     harness's public cancel event; after invocation it is `unknown` (Operations O3).
   - Testing O3 is unchanged. `notSent` needs a real concurrency conflict, so it is proven in an
     App Story (weakness 6).
   - Runs record `calls`, `requests` (with inputs) and `exit`.

```ts
const Retry = CommitWithRetry({ ticketId: Schema.String }, { maxRetries: 1, backoff: "1 second" });

export const givesUp = story
  .fragment(Retry, {
    id: "CommitWithRetry/gives-up",
    input: { request: { ticketId: "T-1" } },
    requests: { send: () => Effect.fail({ _tag: "Busy" as const }) },
  })
  .process()                        // start: first send, answered Busy
  .advance("1 second")
  .process();                       // retry, Busy again: gives up

export const unknownStops = story
  .fragment(Retry, {
    id: "CommitWithRetry/unknown-stops",
    input: { request: { ticketId: "T-1" } },
    requests: { send: () => Effect.never },
  })
  .process()                        // invoked and held
  .cancel("send")                   // post-invocation cancel: unknown
  .process();

test("retries the confirmed request, then gives up", async () => {
  const run = await givesUp.run();
  expect(run.requests).toEqual([
    { request: "send", input: { ticketId: "T-1" } },
    { request: "send", input: { ticketId: "T-1" } },
  ]);
  expect(run.exit).toEqual({ exit: "GaveUp", payload: {} });
});

test("an unknown result never sends again", async () => {
  const run = await unknownStops.run();
  expect(run.requests).toHaveLength(1);
  expect(run.exit?.exit).toBe("Uncertain");
});

const Title = Field(Schema.String, { validate: (v) => (v ? null : "Required") });
export const locked = story
  .fragment(Title, { id: "Field/locked", input: { start: "a" }, guards: { canEdit: () => deny("Locked") } })
  .send(Title.E.Changed({ value: "b" }))
  .checkpoint("after");

test("a denied edit changes nothing and calls nothing", async () => {
  const run = await locked.run();
  expect(run.checkpoints.after.snapshot.memory.value).toBe("a");
  expect(check(run.checkpoints.after.snapshot, Title.E.Changed({ value: "c" }))).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "Locked" }],
  });
  expect(run.calls.onChanged).toEqual([]);
});
```

---

## 8. Against the problems

"Prevents" means enforced by types, construction or a `flow check` error. Everything else is
labelled "by convention" or "allows".

| # | Verdict | How |
| --- | --- | --- |
| L1 stale timers | **prevents** | Schedules stop on leaving. Firings carry an arming id, so a firing queued before a restart is not delivered. |
| L2 late results | **prevents** | Results carry their call id and are delivered only while that call is current. |
| L3 leftover memory | **prevents** | Each activation starts from `initial`. |
| L4 no way out | **prevents** | The host may always abandon; check 3 errors otherwise. |
| L5 abandoned effects | **prevents (route); by convention (what the host does with it)** | `abandoned` is required, non-empty and durable. |
| L6 silent admission | **prevents** | `notSent` (an Operations amendment); one outstanding call. |
| L7 departure gap | **prevents (the information gap); by convention (the next-submit guard)** | `pending` runs synchronously in the leaving transition, so a guard can see it at once. Checkout's `Start` guard is host code. |
| L8 phantom replies | **prevents** | Per-call ids. Stories obtain results only through fixtures; there is no injection. |
| E1 broken invariants | **prevents** | Public `events` are refused only by declared guards. Whole-transition decline means no half turn. |
| E2 interfaces growing with depth | **prevents (allows public events, by choice)** | Everything else stops at each level. |
| E3 hidden endings | **prevents** | Only exits return. Subroutine callbacks cannot target. |
| E4 refusal by forwarding | **prevents** | Nothing forwards public events; a denied raise declines its source, and `check()` shows it. |
| E5 preempting observers | **prevents** | `abandoned` cannot target, raise or call callbacks (types). |
| H1 bypassed policy | **by the author's choice** | `hostEvents` means the host mediates. A public event plus `{}` callback allows H1. |
| H2 unforeseen checks | **allows, by choice** | Declare a guard in the fragment. |
| H3 faked results | **prevents** | Exits are taken; `internalEvents` come only from schedules and outcome maps. |
| H4 misrouted or mislabelled results | **prevents (host side); flow check (fragment side)** | Token origin and class; check 10. |
| H5 interrupt treated as not sent | **prevents** | `interrupt` carries the Attempt and is distinct from `notSent`. Check 10 errors on a resend after it. |
| D1 drifting copies | **prevents** | Memory is readable everywhere, and `live` avoids pushes. |
| D2 live values too late | **prevents** | Commit input reads fragment memory only, and selects read only `payload` (types). |
| D3 feedback loops | **by convention** | Server values come as `hostEvents`; whether their handler calls a save callback is fragment code. |
| D4 unmapped outcomes | **prevents** | Two exhaustive maps, plus `defect` on mapper throws. |
| D5 restore in flight | **prevents** | Call ids and `abandoned` records are durable; each restored outcome is mapped. |
| D6 same-turn seeding | **prevents** | Staged `input` with `event`. |
| D7 drafts lost on abnormal endings | **allows** | Exits can carry drafts; abandoning drops fragment memory by design. |
| T1 partial turns | **prevents** | One fused transition, with whole-transition decline and terminal totality. |
| T2 schedule baseline traps | **allows; check warns** | `restartOn` is idle on entry; check 14. |
| A1 forwarding that compounds | **prevents** | |
| A2 two unrelated blocks | **prevents** | One block per instance. |
| A3 conditional rules | **prevents** | |
| A4 overloaded words | **prevents** | |
| A5 I/O inside fragments | **prevents** | |
| A6 silence discovered late | **prevents** | Every port is required. |
| A7 forgotten first send | **prevents** | `start`; check 2. |

---

## 9. `flow check` and `flow graph`

**Errors**

1. **Type mirror.** `flow check` reports every type error above for untyped callers: placement,
   unfilled ports, exhaustive maps, token origin and class, raise and callback targets, I/O in
   fragments, instance names and deny-code literals.
2. **Stuck waiting (A7):** a state that handles only request results is reachable with nothing
   outstanding.
3. **No way out (L4):** a subroutine with no reachable exit and no leaving host transition.
4. **Non-total delivery (T1):**
   - a state reachable while a call is outstanding, without an unguarded handler for each result
     event, that does not leave;
   - a raise reachable from a result handler, exit filling or timer-fired handler into a
     `hostEvent` the child does not handle unguarded at its root or in every leaf.
5. A raise cycle; a raise into a child entered or left by the same transition; two fused parts
   with non-self targets.
6. A `hostEvent` with no handler at the root and none in some leaf.
7. `start` on a default path.
8. A path that sends a request while a call to it may be outstanding.
9. A relay whose kind, success or failure differs.
10. **H4/H5:** a commit's `unknown`, `interrupt` or `defect` mapped to an event whose handler can
    reach a fresh send of the same request in the same activation.

**Warnings**

11. A public fragment event unhandled in a reachable fragment state, at its full path.
12. A dead contract: a guard never used, a callback never called, a request never sent or relayed,
    or an exit never reached.
13. A fragment exit taken while one of its commits may be outstanding (its result goes to
    `abandoned`).
14. **T2:** a subroutine state whose only progress is a `restartOn` schedule.
15. A fragment used by only one machine (info).
16. A changed fragment shape without a version bump on a persisted host (`flow diff`).

**What `flow check` cannot prove:** what closures compute (guards, selectors, `hostEvent` handlers;
D3), whether host code uses `abandoned` to stop a second submit (L5, L7), and whether exits carry
drafts (D7).

**`flow graph`**

- Each instance is a collapsible cluster labelled `instance: Id (trait|subroutine)`.
- Request edges go to the operation, with result back-edges.
- `abandoned` edges appear twice: `pending` on each leaving transition, and terminal outcomes as a
  host turn.
- Raises are dashed and part of their source transition. `start` appears on every edge into the
  step.
- **`flow explain Checkout ADDRESS.EDITING ADDRESS.street.Changed`** shows `Field`'s handler and
  its guard filled by `AddressStep`.

---

## 10. Adds and removes

**Against [proposal.md](../proposal.md)**

- **Adds:**
  - `hostEvents` and `live`;
  - `requests`, with `kind`, `success`/`failure`, `operation`, `results`, `notSent` and
    `abandoned`;
  - `start`;
  - `input` on fragments;
  - `traits`;
  - `guards` and `callbacks` blocks;
  - abandonment and reconcile;
  - fusion with whole-transition decline and terminal totality;
  - relay;
  - call and arming ids;
  - `story.fragment` with request fixtures and `cancel`;
  - checks 1–16.
- **Removes:**
  - `props`, `prop`, `callback`, `guard()` and `embeds`;
  - UI forwarding;
  - host outcome mappings onto fragment internal events;
  - all of proposal.md's open questions.

**Against [fragments.md](../../fragments.md)**

- **Also removes:**
  - the combined guard order and injected guards;
  - "the outer target wins";
  - `events: "internal"`;
  - late events keyed by full name;
  - `prop.optional`;
  - "at most one raise deep".

**Counts after round 2:**

| | Keywords | Numbered rules | Atomic rules | Checks |
| --- | --- | --- | --- | --- |
| Now | ~22 (round 1: ~25) | 11 | ~29 (round 1: ~31) | 16 (round 1: 22) |

The round-2 additions are `pending`, call and arming ids, terminal totality and mapper defects.
They are counted after the drops.

---

## 11. Weaknesses

1. A middle layer cannot hide a child's public events.
2. Exhaustive maps, required ports and `abandoned` switch statements are verbose (10–15 lines per
   commit placement).
3. The new runtime rules:
   - `start`;
   - fusion with terminal totality;
   - call and arming ids, persisted;
   - `notSent`;
   - the staged `input`/`start` exception;
   - `abandoned` as a new turn source;
   - `check()` evaluating raise payload mappers.
4. Traits live only at a root.
5. Type cost: result tokens with class brands, nested `E` paths, and the `event` union in `input`.
6. Fragment Stories cannot produce `notSent`; it needs an App Story with a real conflict.
7. Instance name = state name for subroutines.
8. L5 and L7 still depend on the host using `late` in a guard. The route is enforced; the policy is
   not.
9. Entry input is per placement (one block) rather than per edge, which round 2 favoured. The
   staged read is the cost (revision log round 2, "Rejected").

---

## 12. Possible cuts (for the user to decide; none applied)

These are ranked by the round 2 simplicity audit. The losses include what the correctness review
(section 8.5/8.7) said was understated.

| # | Cut | Simplifies | Use cases that break | Reopens |
| --- | --- | --- | --- | --- |
| 1 | **`live`** | 1 word, 1 rule clause | Poll slowing when hidden; AutoSave's server-copy guard; any guard over a changing host value | D1 (values pushed by `hostEvents` become copies). **Understated in combination:** with payload-only selects (applied in this round), read keys could then change only by a `hostEvent` copy, and a missed push refreshes a stale key (L2-like). |
| 2 | **"Every port required, `{}` means ignore"** | 1 rule; shorter placements | nothing functional | A6 |
| 3 | **Staged `input`/`start`** (pre-turn reads only) | 1 Machines O3 exception | seeding a step from the same turn's patch; `start` sending the captured request | D6, and (understated) **A7 and D2**: under pre-turn reads, fragment memory is undefined at `start`, so the first send cannot use the captured request |
| 4 | **Fused raise plus `hostEvents`** | 2 words, rule 10's raise part, checks 4–6 | Debounce input; Field `Set`; host feeding any fragment | H1, D3, E4, A1. Cutting only the whole-transition decline reopens T1. |
| 5 | **Requests for reads** (keep commit requests) | read kind, read restore, read select rules | Poll and AddressStep owning their reply | D4 and L2 for reads; (understated) D5 (a pending read strands its waiting state at restore) and H3/H4 for reads (host-mapped read outcomes can fake `Verified`) |
| 6 | **Steps inside fragments** | relay, nested `start`, nested ids, `abandoned` through relays | composite steps (DeleteFlow, a wizard step containing a confirm) | prior-art D1 (rebuild composites by hand), A1 inside composites. It also removes L5 at depth. |
| 7 | **`start`** (the host's entering transition sends first) | 1 word, the default-path rule, part of the O3 exception | self-contained first sends | A7, D2, and (understated) L8: two owners issue the same request, so the one-outstanding check spans both |
| 8 | **Forbid abandoning a sending step** | most of the `abandoned` protocol | leaving mid-commit | **L4 fully** for hung adapters (understated). The route is still needed, because a post-invocation cancel reports `unknown`. L7 does vanish. |
| 9 | **Trait callback targets** | 1 rule clause | idle → LOCKED; hold → WIPING (6.8) | coverage only (use a step instead) |
| 10 | **Requests entirely** | ~9 words, rules 7–8, ~6 checks, 3 amendments | fragment-owned retries, fenced results | D2, D4, D5, H3, H4, A5, A7, L2, L5, L6, plus **H5, L7, L8** |

---

## 13. Plan changes, if accepted

| Plan | Change |
| --- | --- |
| Machines O1–O2 | `traits`, subroutine states, ports, exits, abandonment, the default-path rule |
| Machines O3 | Fusion with whole-transition decline and terminal totality; the staged snapshot for `input` and `start` (one exception); `abandoned` as a turn source with no event |
| Machines O4 | `check()` evaluates raise payload mappers to supply child guards |
| Machines O5 | Arming ids on firings; a restart invalidates queued firings |
| Machines O8 | Fragment slices in `memory` |
| Operations O2 | Request bindings require `success` and every failure tag (against optional members); omitted standard outcomes route to the fragment; fencing exception to "its event reaches the actor's later state"; a mapper throw delivers `defect` |
| Operations O3 | `notSent` for `reject`, pre-invocation cancel and never-invoked restore on request-bound commits; Attempt on `unknown`/`interrupt` |
| Runtime, Persistence O6 | Durable call ids and `abandoned` records; a pending read restores as `interrupt` |
| Testing O1 | `story.fragment` with request fixtures and `cancel` (O3 and O5 unchanged) |
| Inspection O1/O6, CommandLine O5 | Fragment tags, clusters, `abandoned` edges, checks 1–16 |
| Persistence, ServerRendering | Fragment id, version and Schema parameters in the shape digest |
| Package O1 | `trait` and `subroutine` in the root route; `story.fragment` in testing |

## Revision log (round 1)

### Correctness review, opus-split section

- **B1, an abandoned in-flight commit is dropped.** *Fixed.* Commit requests require a
  non-empty, non-targeting `abandoned` route (borrowed from codex, minus the target). The old check
  14 became a type requirement; check 20 warns on exits taken while a commit may be outstanding.
  Checkout and TicketList show it.
- **B2, silent admission leaves the fragment stuck.** *Fixed differently:* the new `notSent` outcome
  for commits, rather than `interrupt` (an Operations amendment), plus one outstanding call per
  request (borrowed from codex). Reason: `interrupt` can follow invocation (M1), so reusing it would
  make "safe to retry" untrue.
- **M1, retrying on `interrupt`.** *Fixed.* `interrupt` and `unknown` now go to `Uncertain`, and
  only `notSent` and `Busy` retry. Check 13 errors on resending a commit after
  `unknown`/`interrupt`/`defect`.
- **M2, the host can map a failure tag to success.** *Fixed.* A request declares one `success`
  result and `failure` results; the host's `success` accepts only the success token.
- **M3, a dropped raise commits half the turn.** *Fixed.* Raises fuse into one transition, a denied
  or unhandled raise declines the whole transition, and `check()` reports the inner code. Check 8 is
  now an error.
- **M4, `input` reads pre-turn data with no event.** *Fixed.* `input` reads the staged snapshot plus
  the entering `event` or exit payload (6.7 shows `event`).
- **M5, the H1 overclaim.** *Fixed.* H1 is now "by the author's choice". I rejected a `mustAct`
  mode: `hostEvents` already gives the author the strict option without a second mechanism.
- **M6, restore.** *Fixed.* Activation ids persist with outstanding calls; a pending read restores
  as `interrupt`. Listed in the plan changes.
- **m1.** *Fixed:* commit selects receive only `payload` (the `request` keyword was dropped). Read
  selects may also read host keys (weakness 8).
- **m2.** *Fixed:* `state` is typed as the fragment's leaf-path union. The hand-typed `editable` was
  removed.
- **m3.** *Fixed:* `raise` targets only `hostEvents`. D3 is relabelled "by convention".
- **m4.** *Fixed:* the `start` and `input` staged-read exception is listed in the plan changes.

### Principles review, opus-split section

- **Blocker 1, two turn models.** *Fixed.* There is one: fusion, pre-turn reads, whole-transition
  decline. I **kept** one exception the reviewer prefers to avoid: `input` and `start` read the
  staged snapshot. Reason: under pre-turn reads, D6 (an exit that updates memory and enters a step
  in one transition) can only be avoided by convention, because closures cannot be checked
  statically. The staged read prevents it by construction, and the exception covers only fresh
  activations.
- **Major 2, live values removed.** *Accepted.* `live` is restored. The question is "must it stay
  fixed for the activation?" (borrowed from codex section 2.1). Requests cannot read `live`, so D2
  stays prevented.
- **Major 3, trait callbacks cannot move the host.** *Accepted.* I adopted opus-single's rule: a
  callback target must lie inside the fragment's own placement node.
- **Major 4, `input` timing.** *Fixed* (same as correctness M4).
- **Major 5, a default-path subroutine with `input` or `start`.** *Fixed.* It is a construction
  error (borrowed from sonnet-split). Poll and Confirm, which declare neither, remain valid default
  states.
- **Major 6, request kind.** *Fixed.* `kind: "commit" | "read"` decides the standard outcomes.
  Former check 16 was removed.
- **Major 7, relay not shown.** *Fixed.* Section 6.7 relays `CommitWithRetry.send` through
  `DeleteFlow.remove`.
- **Major 8, abandoned route.** *Fixed* (same as B1).
- **Minor 9, naming.** `guards` (contract) stays beside `guard` (transition), because the meaning
  carries over. `request` was replaced by `payload`, which also removes the clash with Operations'
  "request".
- **Minor 10, a hand-typed guard.** *Fixed.*
- **Minor 11, how `{}` shows in inspection.** *Fixed:* it is listed as `ignored`.
- **Minor 12, the yardstick.** *Fixed.* E4, A7, H4, D5 and the reviewers' L5, L6, D6, D7, T1 and T2
  are all in section 8.

### Cross-proposal advice

- **Testing via a harness host with fixture Layers instead of `reply`.** *Rejected for now.*
  Fixtures cannot express `notSent` or `unknown` deterministically without fault injection, and a
  fragment's boundary is its request port, not a service. Testing O3/O5 are therefore named as
  amended. I would accept a fixture-backed `story.subroutine` if Testing grows deterministic
  `unknown` fixtures.
- **Shape.** The principles review favours the split. I added one line on "trait" meaning a Scala
  trait (with state).
- **The SCXML staged raise.** *Removed*, in favour of fusion (the principles review's verdict).

## Revision log (round 2)

### Correctness review

- **M1, departure gap (L7).** *Fixed* with codex-split's synchronous `pending`, using one handler
  shape: `abandoned({ outcome, attempt })` runs fused into the leaving transition, then again at
  settlement. Checkout's `Start` now guards on `late`. The prose claim is reworded: the route is
  enforced, the guard is host code (L7 row).
- **M2, abandoned success dead-ends.** *Fixed.* Checkout has `Reconcile`. A `Placed` status goes to
  PLACED; an `Unclear` status runs `O.Orders.place.retry(attempt)` through RECONCILING. UNSURE uses
  the same path.
- **m1, TicketDelete records the Attempt on definite failure.** *Fixed:* failure and `notSent`
  clear it.
- **m2, `live` reads lanes.** *Stated* in rule 9.
- **m3, two O3 exceptions listed apart from the turn rule.** *Merged* into rule 10's ordering
  bullet.

### Principles review

- **1, does `"self"` count as a target; show a trait callback that targets.** `"self"` does not
  count (rules 6 and 10). The new §6.8 (HoldToConfirm → `onHeld` targets WIPING) shows a targeting
  callback.
- **2, `live` rule and example; select contradiction.** *Fixed.* `live` has a row, rules 7 and 9,
  and a full example (Poll slows while the tab is hidden). All selects now read only `payload`, so
  read keys live in the request Schema (Poll's `key`).
- **3, root-trait input at admission; relay's `abandoned`; the double-order claim.**
  - Admission is defined in rule 2.
  - `abandoned` belongs to the binder through relays (rule 8; §6.7 shows it two levels down).
  - The claim is replaced by `pending` plus an honest "by convention" for the guard.
  - The exit-to-enclosing-exit form is now defined (rule 4).
- **4, projection defects; terminal totality.** *Fixed*, both borrowed from codex-split. A throwing
  outcome mapper delivers `defect`. A raise reachable from a result, exit or timer handler must
  target a total `hostEvent` (check 4). `CommitWithRetry`'s `Busy` and `HoldToConfirm`'s `Held`
  have unguarded fallbacks.
- **5, unlisted amendments; fixtures.** *Fixed.* Operations O2 (required mappings, routing,
  fencing exception, mapper defect), Machines O3 (`abandoned` as a turn source), O4 and O5 are in
  section 13. Testing moved to fixtures (see below).
- **Minors.**
  - "Eight ports" is now nine.
  - The machine's `E` versus the definition's `E` is stated (section 2).
  - D5 says acknowledged commits restore as `unknown` and never-invoked ones as `notSent`.
  - §6.7 has a real component.

### Cross-proposal borrowing

- **From codex-split:**
  - `pending` on departure;
  - total terminal delivery;
  - mapper throws deliver `defect`;
  - per-call ids (L8) and per-arming ids (HoldToConfirm needs them);
  - fixture-backed Stories.

  Codex-split's per-outcome handler blocks are **not** borrowed: one `{ outcome, attempt }` handler
  is the audit's no-loss drop, kept with its conditions (synchronous `pending`, non-targeting,
  no-raise).
- **Reconcile flow:** from sonnet-split UNSURE and codex-split RECONCILING.
- **Fixtures for Stories:** *accepted* (from codex-split and sonnet-single). `reply` is removed.
  `.cancel(request)` gives `unknown` through Operations O3's real post-invocation path, so Testing
  O3 and O5 are unchanged. Cost: `notSent` needs an App Story (weakness 6).

### Simplicity: no-loss drops applied (section 8.5 "keeps")

- **Rule 5's "raised only by the direct parent":** removed; rule 10 states it.
- **Rule 9's "a fused target may not leave a node whose child is raised into":** removed; implied
  by "active before and after".
- **Checks restating rules and types** (old 1, 2, 3, 4-type, 7-type, 9, 14, 15, 16): collapsed into
  check 1, "type mirror".
- **`story.trait` + `story.subroutine` → `story.fragment`.**
- **All selects read only `payload`:** applied. Condition: `live` stays (it does).
- **`ignored` label:** removed.
- **Cross-proposal drops already true here:** one `{ outcome, attempt }` abandoned handler (now
  with synchronous `pending`, non-targeting, no-raise); one callback-target rule; `raise` only into
  `hostEvents`; one optional form; one terminal-totality rule.

**Counts:** ~22 keywords (was ~25), 11 numbered rules / ~29 atomic (was ~31), 16 checks (was 22).
These include the round 2 additions.

### Feature cuts

Not applied. They are listed in section 12 with the understated losses.

### Rejected

- **Per-edge entry input** (principles review, "remaining disagreements"). *Kept per placement with a
  staged read.* Reasons:
  - **A2:** an instance's `input`, requests and exits stay in one block.
  - **One canonical place:** several routes into one step need no repeated mapper.
  - **D6:** prevented by construction rather than by convention.
  - The exception is one bullet, and applies only to fresh activations.
- **Forbidding `reject` instead of `notSent`** (codex-split). *Kept `notSent`*, which the
  correctness review rated "best in class". It also covers pre-invocation cancel and never-invoked
  restore, which forbidding `reject` does not.
- **Codex-split's per-outcome `abandoned` handlers.** One handler with a `switch` on `outcome` is
  shorter, and the audit confirms it loses nothing under the stated conditions.
