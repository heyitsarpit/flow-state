# Machines built up from pieces: `trait`, `routine` and the actor (Opus proposal)

Status: research proposal, not accepted, 2026-10-28. It designs the whole machine API from
composable pieces instead of carving fragments out of today's machine API. It is judged against
[principles.md](../principles.md) and the review additions (E4, E5, L5–L8, H4, H5, D5–D7, T1, T2,
A7). Request semantics are taken from [opus-split.md](opus-split.md) and
[codex-split.md](codex-split.md) (revision 2) on purpose, so this file can be judged on structure.
Where this file and a plan differ, the plan wins; section 9 lists the plan changes.

---

## 0. The idea in one paragraph

A machine is a tree of **nodes**. Every node follows one lifecycle: on entry it gets fresh memory,
its traits, its timers and its first actions; on exit all of it goes away, and late results are
fenced. Code is **lexically scoped**: a handler sees the memory and events of its own piece, from
the node it is written in up to the piece's root. A **piece** is a unit of code with a contract and
a body. There are three kinds, and they are the same thing at different sizes:

| Piece | What it is | Placed where | Ends how |
| --- | --- | --- | --- |
| **trait** | behaviour a node _has_: memory, events, timers; no states | in any node's `traits` | when its node is left |
| **routine** | a node you _go into_: states, traits, memory; ends through exits | as a state in `states` | by an exit, or abandoned by its host |
| **actor** | a root routine with no exits, plus what only a running thing has: id, input from `ensure`, `operations`, `context`, persistence | in the app | by disposal |

Plain substates are anonymous inline nodes of their piece. A reusable step is a named routine. The
machine is the actor's root routine. It still compiles to one actor, one mailbox, one snapshot and
one turn: there are no child actors and no parallel regions.

---

## 1. The model in one page

### 1.1 Ports by level

Each piece talks to whoever placed it through declared **ports**. The table is the recursion: the
same questions are answered at every level, and only the actor's answers are bound by the app
instead of a host.

| Question | trait / routine port (filled by its host) | actor port (filled by the app) |
| --- | --- | --- |
| What is fixed when it starts? | `input`: from the entering edge (`S.X.from(...)`), or for a trait from its binding | `input`, from `ensure` |
| What must it see as it changes? | `live` | `context` |
| What I/O may it do? | `requests` | `operations` |
| Where may its placer say no? | `guards` | n/a (the actor's own guards) |
| What does it tell its placer? | `callbacks` | `send` (to other actors) |
| How does it finish? | `exits` (routines) | disposal |
| Who may send each event? | `events` (anyone), `hostEvents` (only the placer), `internalEvents` (only itself) | `events`, `internalEvents` |

### 1.2 Contract and body

The definition/machine split becomes **contract and body per piece**:

- **Contract** (data): `id`, `input`, `live`, `events`, `hostEvents`, `internalEvents`, `memory`,
  `initial`, `states` (a record of node contracts, with routines placed by value), `traits`,
  `guards`, `callbacks`, `requests`, `exits`. It produces `S`, `E` and the Schemas.
- **Body** (behaviour): a tree that mirrors `states` exactly, with `default`, `on`, `start`,
  `schedules`, `activities` (actor only), `onContext` (actor root only), and at each placement the
  instance's binding: `live`, `guards`, `callbacks`, `requests`, `exits` (and `input` for traits).

A trait or routine is **one call**, `trait(contract, body)` or `routine(contract, body)`. The actor
keeps **two calls**, today's `definition(contract)` and `machine(definition, body)`. The asymmetry
is deliberate: other actors import an actor's contract (`Provider.select`, `send` targets) and lazy
entries must not pull in the body; nothing imports a piece except its host.

### 1.3 What changed from the starting sketch

| Starting sketch | Here | Why |
| --- | --- | --- |
| `actor({ id, ..., root: routine(...) })` | today's `definition` + `machine` are the actor | Zero new words for the 90% case; cross-actor imports and lazy entries need the contract importable alone. |
| `use(Confirm, { exits, ... })` | the routine value is placed in the contract (`DELETE_ASK: Confirm`); its binding is the body node at the same path | Placement shapes `S`, `E` and the snapshot, so it is data; binding is behaviour. One block per instance survives (A2). |
| Plain substates are anonymous routines | they are **inline nodes**: they share their piece's scope; only named pieces are opaque | If inline nodes were opaque, every substate would need ports to read its parent's memory. Lexical scope is the familiar rule. |
| entry `input` per placement | **per edge**: `S.X.from(mapper)`, including `default` | Typed exactly by the event or exit payload; no staged-snapshot exception for surviving scopes (round-2 principles verdict). |
| exit/callback fillings without guards | fillings are **ordinary `on` handlers that must be total** | One handler shape everywhere; guards choose among the host's reactions but can never refuse the piece's decision (E1). |
| fragment memory | **node memory everywhere**: any node may declare `input`, `memory`, `initial`, `traits`, `start` | Leftover memory becomes impossible wherever the author scopes a field to its node, not only inside fragments. |
| nested snapshot shape | **flat per piece, nested per instance**: node fields live in the piece's memory record and are absent while their node is inactive; each trait or routine instance is one nested slice | Existing reads such as `s.memory.draft` keep their shape; `snapshot.state` stays the complete leaf path. |

### 1.4 What a node is

```ts
// A node contract (in the definition, or a routine's contract)        // a node body (in the machine)
FAILED: {                                                               FAILED: {
  input: { reason: Schema.String },     // fixed at entry, from the edge   start: [...],          // actions on every entry
  memory: { error: Schema.String },     // lives while FAILED is active    schedules: { ... },    // armed on entry
  initial: ({ input }) => ({ error: input.reason }),                       on: { ... },
  traits: { ... },                      // behaviour FAILED has            traits: { ... },       // their bindings
  states: { ... },                      // children (inline or routines)   states: { ... },
}                                                                        }
```

A leaf with nothing is `{}`. A routine placed as a state is its value: `SAVING: SaveTitle`.

---

## 2. Rules

Twelve numbered rules. They cover the whole machine, not only fragments: rules 1–6 replace the
memory and scope parts of Machines O1–O2; the rest of O2–O8 stands.

1. **Pieces and placement.** A piece is the actor (`definition` + `machine`), a
   `routine(contract, body)` or a `trait(contract, body)`. A routine is placed as a state value in
   `states`; a trait in any node's `traits`. The types refuse the other placement. The binding is
   the body node at the same path. Within one piece, event names, memory fields and instance names
   are distinct.

2. **Lexical scope.** Code in a piece sees that piece's memory and events from the node it is
   written in up to the piece's root, plus its children's instance slices (read-only) and the ports
   its piece declares. It sees nothing inside another piece and nothing outside except through
   ports. `O`, `context`, `activities`, `send` and `onContext` exist only in the actor's piece. In
   a piece's callbacks, `state` is the active leaf path relative to that piece.

3. **One lifecycle for every node.** Entering (outermost first): read `input`, run `initial`,
   activate the node's traits (each trait's `input`, then its `initial`), enter the default child.
   Then arm schedules, start activities and append `start` actions to the transition. Leaving
   (deepest first): cancel schedules, release activities, drop the node's memory and its trait and
   routine slices. The actor's root is entered once at admission, gets its input from `ensure`,
   is never re-entered, and has no exits.

4. **Input comes from what activates it.** A node or routine with `input` is entered only by a
   target that supplies it, `S.X.from(mapper)`; this includes `default`. A target may not pass
   through an input node it would enter. A trait's input comes from its binding. `start` is
   forbidden on the admission path (the actor root's default chain), because admission is not a
   transition and runs nothing.

5. **Reads.** Every callback in a turn reads the pre-turn snapshot and the event, exit payload or
   callback payload. A node entered by this turn is read as freshly initialised; its `initial` and
   its traits' `input` mappers also read its `input`. Nothing reads another part's pending patch.

6. **Events.** Each piece declares `events` (anyone may send them, at the instance path),
   `hostEvents` (only its direct host, through `raise`) and `internalEvents` (only its own schedules
   and result mappings). An event is tried from the deepest active node of the piece that declares
   it, then that node's ancestors in the same piece. Host and piece event sets are disjoint. The
   actor has no `hostEvents`.

7. **Routines start and end explicitly.** Only the instance node is targetable from outside. A
   routine returns only by taking an exit inside it; the host maps every exit. Any host transition
   handled at or above the instance node may leave it, which **abandons** it: no exit is taken.

8. **Fillings are total handlers.** Exit, callback and `abandoned` fillings have the shape of an
   `on` handler, including ordered alternatives, and must end in an unguarded alternative. Guards
   in a filling choose among the host's reactions; they never refuse the piece's own transition.
   Only declared `guards` ports can refuse a piece's event. A callback may target only states inside
   the node where its piece is placed (so a routine's callbacks never move the host). `abandoned`
   has the same shape without `target` and `raise`: it never moves the actor, raises or calls
   callbacks.

9. **Work belongs to the activation that started it.** A timer firing belongs to its node
   activation and carries an arming id. An operation result belongs to the piece activation that
   issued it and carries a call id. A current result reaches that piece as an ordinary internal
   event, handled by its active state or that state's ancestors. If the activation has ended, timer
   firings and read results are dropped with evidence, and commit results go to the binder's
   `abandoned`. For the actor's piece, the activation is the incarnation: today's rule unchanged.

10. **Requests** (from opus-split rule 7, with codex-split's semantics).
    - A request has a `kind`, `"commit"` or `"read"`, one `success` result and named `failure`
      results.
    - Its input is computed by the piece, from its own memory (plus `live` for reads). The host's
      select receives only `payload`, so keys live in the request Schema.
    - The host maps operation `success` only onto the success result and each actual failure tag
      only onto failure results; the result tokens exist only inside its `operation` function.
    - The piece maps every result plus `notSent`, `unknown`, `interrupt` and `defect` for commits
      (each standard outcome carries the `attempt`), or `interrupt` and `defect` for reads.
      `notSent` means guaranteed never invoked: `reject`, cancel before invocation, or a restored
      call that was never invoked.
    - A throwing outcome mapper records an issue and delivers `defect` without calling another
      mapper.
    - At most one call per request is outstanding per activation; a second is a pre-publication
      turn rejection.
    - A middle piece relays a child's request by filling it with its own request token; kind,
      success and failures must match.

11. **Abandoned commits** (from codex-split 4.5 with opus-split's one handler). Every commit
    binding requires `abandoned`, receiving `payload: { outcome, attempt, value?, error? }` where
    `outcome` is `"pending" | "success" | "failure" | "notSent" | "unknown" | "interrupt" |
    "defect"`. If a call is outstanding when its activation ends, `abandoned` runs with `"pending"`
    **fused into the leaving transition**, then once more with the terminal outcome as a later
    host turn. It belongs to the binder through any relays and is durable across restore.

12. **One turn.** A transition, the fillings it calls and the child handlers it raises compile into
    one transition.
    - `raise` targets a direct child instance's `hostEvents`, only in a child active before and
      after the transition. The raise graph is acyclic. At most one fused part has a non-`"self"`
      target.
    - All guards run on the pre-turn snapshot; `check()` evaluates raise payload mappers to supply
      child guards. If any fused guard declines or a raised event is unhandled, the whole
      transition declines and `check()` reports that code.
    - Terminal totality: a raise reachable from a result handler, a filling or a timer-fired
      handler must target a `hostEvent` the child handles unguarded at its root or in every leaf.
    - Updates apply in order (source, fillings, raised handlers); each patch key goes to the node
      that owns it. Then action parameters. One batch validates; one publication.

**What the rules remove from today plus opus-split:** "substates share the actor's memory"
(replaced by rule 2); fragment activation rules separate from state entry (rule 3 is the only
lifecycle); the staged-snapshot `input` filling; "traits live only at a root"; "subroutines with
input cannot be defaults" (they can, through `default: S.X.from(...)`); `story.fragment` (see 4.9).

---

## 3. Keyword ledger

Every framework word used in section 4, classified. "Existing, extended" means the word is in the
plans and keeps its meaning, but now applies in more places.

| Class | Words |
| --- | --- |
| **New** (17) | `trait`, `routine`, `traits`, `hostEvents`, `live`, `guards` (port declaration and filling; per-transition `guard` is unchanged), `callbacks`, `requests`, `kind` (`"commit"` / `"read"`), `operation`, `results`, `notSent`, `abandoned` (payload `outcome`, `"pending"`, `value`, `error`), `exits`, `start`, `raise`, `payload` |
| **New in testing** (3) | Story `.enter(input)`, `.leave()`, `.cancel(request)`; piece cuts expose `exit`, `calls`, `requests`, `abandoned` |
| **Existing, extended** | `states` (now a record of node contracts; a routine value is a node), `memory` / `input` / `initial` (any node, not only the root), `.from` (on a state token it supplies that node's input; on events and exits it supplies a payload, as today), `default` (may carry `.from`), `schedules` (any node of any piece; callbacks may read `live`), `story.machine` (also accepts a trait or routine, wrapped in a harness actor), `S.X.is` (also narrows node memory), `E` (nested instance paths) |
| **Existing, unchanged** | `definition`, `machine`, `id`, `events`, `internalEvents`, `context`, `operations`, `on`, `target`, `"self"`, `guard`, `deny`, `check`, `updateMemory`, `actions`, `restartOn`, `schedule`, `send`, `activities`, `onContext`, `select`, `when`, `outcomes`, `success`, `failure`, `unknown`, `interrupt`, `defect`, `commit`, `retry`, `cancel`, `lookup`, `refetch`, `subscribe`, `more`, `placeholder`, `Attempt`, `S`, `E`, `O`, `.child`, `actorRef`, `useView`, `useActorByRef`, `story.app`, `.ensure`, `.send`, `.process`, `.advance`, `.advanceToNextTimer`, `.checkpoint`, `.run`, `fixtures`, `services` |
| **Author-chosen** | piece names (`Debounce`, `Field`, `HoldToConfirm`, `Confirm`, `CommitWithRetry`, `Poll`, `AddressStep`, `SaveTitle`), instance names (`autosave`, `email`, `street`, `ASK`, `DELETING`, `SAVING`, `LIVE`, `ADDRESS`, `REVIEW`, `PLACING`), port names (`onSettled`, `onChanged`, `onHeld`, `canEdit`, `canPress`, `send`, `refresh`, `verify`, `slow`), result and exit names (`Done`, `Busy`, `Rejected`, `GaveUp`, `Uncertain`, `Confirmed`, `Declined`, `Valid`, `Invalid`, `Ok`, `Failed`, `Back`), all state, event and memory names |

Count: 17 new entries plus 3 Story commands, 20 in all; opus-split has 19 entries (17 plus
`story.fragment` and `cancel`). Counting `abandoned`'s payload words separately, as opus-split's
"~22" does, this is about 24 (`outcome`, `"pending"`, `value`, `error`). So this proposal is not
smaller in words: `enter`/`leave` and the codex-style `value`/`error` cost slightly more. Its saving
is in rules and special cases (section 8).

---

## 4. Full examples

`TicketsDomain`, `AuthDomain`, `OrdersDomain`, `AddressesDomain`, and the Layers `DemoShop`,
`DemoTickets` and `HeldOrders`, are declared elsewhere. Every example lists its keywords as
**new**, **extended** (existing word, meaning extended) or **existing**; everything else is
author-chosen.

### 4.1 The reusable pieces

New: `trait`, `routine`, `hostEvents`, `callbacks`, `guards`, `requests`, `kind`, `notSent`,
`exits`, `start`, `live`. Extended: `states` record, `schedules` reading `live`, `.from` on exits.

```ts
// pieces.ts — reusable traits and routines. None of them does I/O, reads context or sends.
import { Attempt, deny, routine, trait } from "flow-state";
import { Duration, Schema } from "effect";

// ── Debounce (trait): tells its host once, `wait` after the last Input ──────────────────
// Its counter is the restartOn baseline, taken when the trait activates with its node.
export const Debounce = (p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      hostEvents: { Input: {} },                       // new: only the placer may send it
      internalEvents: { Due: {} },
      memory: { seq: Schema.Int },
      initial: () => ({ seq: 0 }),
      callbacks: { onSettled: {} },                    // new
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

// ── Field (trait): a validated value; the user edits it, the host may set it ────────────
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      input: { start: value },
      events: { Changed: { value }, Blurred: {} },
      hostEvents: { Set: { value } },
      memory: { value, touched: Schema.Boolean, error: Schema.NullOr(Schema.String) },
      initial: ({ input }) => ({ value: input.start, touched: false, error: p.validate(input.start) }),
      guards: ["canEdit"],                             // new: the one place a host may say no
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
          target: "self",                              // unguarded, no callback: total, and not an edit (D3)
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
        },
      },
    }),
  );
export const isValid = (f: { error: string | null }) => f.error === null;
export const visibleError = (f: { touched: boolean; error: string | null }) =>
  f.touched ? f.error : null;

// ── HoldToConfirm (trait): fires onHeld after a continuous hold ─────────────────────────
// Release is public and unguarded, so no host can refuse or drop it (E1, E4). The arming id
// (rule 9) means a firing queued before a re-press cannot confirm early.
export const HoldToConfirm = (p: { hold: Duration.Input }) =>
  trait(
    {
      id: "HoldToConfirm",
      events: { Press: {}, Release: {} },
      internalEvents: { Held: {} },
      memory: { pressing: Schema.Boolean, presses: Schema.Int },
      initial: () => ({ pressing: false, presses: 0 }),
      guards: ["canPress"],
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
          { target: "self" },                          // the firing is always consumed
        ],
      },
    }),
  );

// ── Confirm (routine): no states, two exits ─────────────────────────────────────────────
export const Confirm = routine(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    exits: { Confirmed: {}, Declined: {} },           // new
  },
  ({ exits }) => ({
    on: { Yes: exits.Confirmed, No: exits.Declined },
  }),
);

// ── CommitWithRetry (routine): sends the request captured at entry; retries only on Busy
//    or notSent, never on unknown, interrupt or defect (H5) ─────────────────────────────
export const CommitWithRetry = <Req extends Schema.Struct.Fields, Res extends Schema.Struct.Fields>(
  shape: { request: Req; result: Res },
  p: { maxRetries: number; backoff: Duration.Input },
) =>
  routine(
    {
      id: "CommitWithRetry",
      input: { request: Schema.Struct(shape.request) },
      memory: {
        request: Schema.Struct(shape.request),        // frozen for every retry (D2)
        attempts: Schema.Int,
        lastBusy: Schema.NullOr(Schema.String),
      },
      initial: ({ input }) => ({ request: input.request, attempts: 0, lastBusy: null }),
      states: { SENDING: {}, BACKOFF: {} },
      internalEvents: {
        Sent: shape.result,
        Busy: { reason: Schema.String },
        Refused: { reason: Schema.String },
        Unsure: { attempt: Attempt },
        Retry: {},
      },
      requests: {
        send: {
          kind: "commit",
          input: shape.request,
          success: { Done: shape.result },
          failure: { Busy: { reason: Schema.String }, Rejected: { reason: Schema.String } },
        },
      },
      exits: {
        Done: shape.result,
        GaveUp: { reason: Schema.String, attempts: Schema.Int },
        Rejected: { reason: Schema.String },
        Uncertain: { attempt: Attempt },
      },
    },
    ({ S, E, requests, exits }) => ({
      default: S.SENDING,
      requests: {
        send: {
          input: ({ memory }) => memory.request,
          outcomes: {
            Done: E.Sent.from((result) => result),
            Busy: E.Busy.from(({ reason }) => ({ reason })),
            Rejected: E.Refused.from(({ reason }) => ({ reason })),
            notSent: E.Busy.from(() => ({ reason: "An earlier request is still running" })),
            unknown: E.Unsure.from((attempt) => ({ attempt })),
            interrupt: E.Unsure.from((attempt) => ({ attempt })),
            defect: E.Unsure.from((attempt) => ({ attempt })),
          },
        },
      },
      states: {
        SENDING: {
          start: [requests.send],                      // new: every entry sends, first and retries (A7)
          on: {
            Sent: exits.Done.from(({ event }) => event),
            Refused: exits.Rejected.from(({ event }) => ({ reason: event.reason })),
            Unsure: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })),
            Busy: [
              {
                target: S.BACKOFF,
                guard: ({ memory }) => memory.attempts < p.maxRetries || deny("NoRetriesLeft"),
                updateMemory: ({ memory, event }) => ({
                  attempts: memory.attempts + 1,
                  lastBusy: event.reason,
                }),
              },
              exits.GaveUp.from(({ memory, event }) => ({
                reason: event.reason,
                attempts: memory.attempts,
              })),                                     // unguarded fallback: total
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
          on: { Retry: S.SENDING },                    // entering SENDING sends again
        },
      },
    }),
  );

// ── Poll (routine): refreshes a keyed read until its host leaves; slower while `slow` ──
// It has no exits: like a machine, it ends only when its host leaves it (L4).
export const Poll = <K extends Schema.Struct.Fields>(
  key: K,
  p: { every: Duration.Input; slowEvery: Duration.Input; maxBackoff: Duration.Input },
) =>
  routine(
    {
      id: "Poll",
      input: { key: Schema.Struct(key) },
      live: { slow: Schema.Boolean },                  // new: read when WAITING arms its tick
      memory: { key: Schema.Struct(key), failures: Schema.Int },
      initial: ({ input }) => ({ key: input.key, failures: 0 }),
      states: { WAITING: {}, REFRESHING: {} },
      internalEvents: { Tick: {}, Ok: {}, Failed: {} },
      requests: {
        refresh: { kind: "read", input: key, success: { Ok: {} }, failure: { Failed: {} } },
      },
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
          on: { Tick: S.REFRESHING },
        },
        REFRESHING: {
          start: [requests.refresh],
          on: {
            Ok: { target: S.WAITING, updateMemory: () => ({ failures: 0 }) },
            Failed: {
              target: S.WAITING,
              updateMemory: ({ memory }) => ({ failures: memory.failures + 1 }),
            },
          },
        },
      },
    }),
  );
```

### 4.2 Debounce: a search box

New: `traits`, `raise`, `callbacks` filling. Existing: `activities`, `subscribe`. A single debounce
can stay a host schedule with `restartOn`; it becomes a trait once a second machine needs it.

```ts
// ticket-search.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Debounce } from "./pieces";

export const TicketSearch = definition({
  id: "Desk/TicketSearch",
  states: { READY: {} },                               // extended: a record of node contracts
  traits: { settle: Debounce({ wait: "300 millis" }) },// new: a root trait lives with the actor
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
        onSettled: { target: "self", updateMemory: ({ memory }) => ({ settled: memory.query }) },
      },
    },
  },
  on: {
    QueryChanged: {
      target: "self",
      updateMemory: ({ event }) => ({ query: event.query }),
      raise: [E.settle.Input],                         // new: fused into this transition
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
  const settling = useView(search, (s) => s.memory.query !== s.memory.settled);
  const results = useView(search, (s) => s.activities.results?.data ?? []);
  return (
    <>
      <input
        value={query}
        onChange={(e) => search.send(TicketSearch.E.QueryChanged({ query: e.target.value }))}
      />
      {settling && <span className="muted">…</span>}
      {/* search.send(TicketSearch.E.settle.Input())  ← type error: a hostEvent */}
      <TicketList tickets={results} />
    </>
  );
}
```

```ts
// debounce.test.ts — the trait alone, in a harness actor (story.machine, extended)
import { story } from "flow-state/testing";
import { Debounce } from "./pieces";

const Quiet = Debounce({ wait: "300 millis" });

// In a piece Story the harness is the host. Its public events are the piece's events and
// hostEvents at the same paths; it records every callback; a cut's `piece` is the piece's slice.
export const quiet = story
  .machine(Quiet, { id: "Debounce/quiet" })
  .send(Quiet.E.Input()).process()
  .advance("200 millis").process()
  .send(Quiet.E.Input()).process()
  .advance("299 millis").process().checkpoint("before")
  .advance("1 millis").process().checkpoint("after");

test("tells the host once, after the last input", async () => {
  const run = await quiet.run();
  expect(run.checkpoints.before.calls.onSettled).toHaveLength(0);
  expect(run.checkpoints.after.calls.onSettled).toHaveLength(1);
});
```

### 4.3 A validated field: sign-up

New: `traits` with `input`, `guards` and `callbacks` fillings. The traits' `input` is read at
admission, from the actor's input and initial memory (rule 5).

```ts
// signup.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Field } from "./pieces";

export const Signup = definition({
  id: "Auth/Signup",
  states: { FILLING: {}, SUBMITTING: {}, DONE: {} },
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
import { deny, machine } from "flow-state";
import { Signup } from "./signup.definition";
import { isValid } from "./pieces";

export const SignupMachine = machine(Signup, ({ S, E, O }) => {
  const createUser = O.Auth.createUser.commit(
    ({ memory }) => ({ email: memory.email.value, password: memory.password.value }),
    {
      outcomes: {
        success: E.Created,
        failure: { EmailTaken: E.Rejected.from(() => ({ reason: "That email is registered" })) },
        unknown: E.Rejected.from(() => ({ reason: "The account may exist; try signing in" })),
        interrupt: E.Rejected.from(() => ({ reason: "Interrupted; try signing in first" })),
        defect: E.Rejected.from(() => ({ reason: "Something went wrong" })),
      },
    },
  );
  // Both fields: refused while submitting, and an edit clears the error. Written inline so the
  // binding is typed from its placement (a shared object literal would lose that context).
  return {
    default: S.FILLING,
    traits: {
      email: {
        input: () => ({ start: "" }),
        guards: { canEdit: ({ state }) => state === "FILLING" || deny("Submitting") },
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ error: null }) } },
      },
      password: {
        input: () => ({ start: "" }),
        guards: { canEdit: ({ state }) => state === "FILLING" || deny("Submitting") },
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ error: null }) } },
      },
    },
    states: {
      FILLING: {
        on: {
          Submit: {
            target: S.SUBMITTING,
            guard: ({ memory }) =>
              (isValid(memory.email) && isValid(memory.password)) || deny("Invalid"),
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
      <PasswordInput signup={signup} />
      {/* signup.send(Signup.E.email.Set({ value: "x" }))  ← type error: a hostEvent */}
      <button disabled={!canSubmit}>Create account</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function PasswordInput({ signup }: { signup: Actor<typeof SignupMachine> }) {
  const password = useView(signup, (s) => s.memory.password);
  const passwordError = useView(signup, (s) => visibleError(s.memory.password));
  return (
    <>
      <input
        type="password"
        value={password.value}
        onChange={(e) => signup.send(Signup.E.password.Changed({ value: e.target.value }))}
        onBlur={() => signup.send(Signup.E.password.Blurred())}
      />
      {passwordError && <p>{passwordError}</p>}
    </>
  );
}
```

```ts
// field.test.ts — the trait alone; the harness fills the guard with a denial
const Title = Field(Schema.String, { validate: (v) => (v ? null : "Required") });

export const locked = story
  .machine(Title, { id: "Field/locked", input: { start: "a" }, guards: { canEdit: () => deny("Locked") } })
  .send(Title.E.Changed({ value: "b" })).process()
  .checkpoint("after");

test("a denied edit changes nothing and calls nothing", async () => {
  const run = await locked.run();
  const after = run.checkpoints.after;
  expect(after.piece?.value).toBe("a");                          // the trait's slice
  expect(check(after.snapshot, Title.E.Changed({ value: "c" }))).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "Locked" }],
  });
  expect(after.calls.onChanged).toEqual([]);
});
```

### 4.4 Confirm and commit-with-retry: deleting a ticket

New: `exits` filling, `requests` binding with `operation`, `results`, `abandoned`, `payload`.
Extended: `S.X.from` (the entering edge supplies `DELETING`'s input).

```ts
// ticket-delete.definition.ts
import { Attempt, definition } from "flow-state";
import { Schema } from "effect";
import { CommitWithRetry, Confirm } from "./pieces";

export const DeleteTicket = CommitWithRetry(
  { request: { ticketId: Schema.String }, result: {} },
  { maxRetries: 3, backoff: "1 second" },
);

export const TicketDelete = definition({
  id: "Desk/TicketDelete",
  states: { VIEWING: {}, ASK: Confirm, DELETING: DeleteTicket, DELETED: {}, UNSURE: {} },
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
import { deny, machine } from "flow-state";
import { TicketDelete } from "./ticket-delete.definition";

export const TicketDeleteMachine = machine(TicketDelete, ({ S, O }) => ({
  default: S.VIEWING,
  states: {
    VIEWING: { on: { Delete: { target: S.ASK, updateMemory: () => ({ error: null }) } } },
    ASK: {
      exits: {
        Confirmed: S.DELETING.from(({ memory }) => ({ request: { ticketId: memory.ticketId } })),
        Declined: S.VIEWING,
      },
    },
    DELETING: {
      requests: {
        send: {
          operation: ({ results }) =>
            O.Tickets.delete.commit(({ payload }) => payload, {
              outcomes: {
                success: results.Done,
                failure: {
                  TicketLocked: results.Busy.from(({ lockedBy }) => ({ reason: `Locked by ${lockedBy}` })),
                  TicketMissing: results.Rejected.from(() => ({ reason: "Already deleted" })),
                },
              },
            }),
          // DELETING has no leaving transition while a call is out, but the route is required.
          abandoned: {
            updateMemory: ({ payload }) =>
              payload.outcome === "unknown" ||
              payload.outcome === "interrupt" ||
              payload.outcome === "defect"
                ? { attempt: payload.attempt }
                : {},
          },
        },
      },
      exits: {
        Done: S.DELETED,
        GaveUp: { target: S.VIEWING, updateMemory: ({ payload }) => ({ error: `${payload.reason}. Try later.` }) },
        Rejected: { target: S.VIEWING, updateMemory: ({ payload }) => ({ error: payload.reason }) },
        Uncertain: { target: S.UNSURE, updateMemory: ({ payload }) => ({ attempt: payload.attempt }) },
      },
    },
    DELETED: {},
    UNSURE: {
      on: {
        Dismiss: {
          target: S.VIEWING,
          guard: ({ memory }) => memory.attempt !== null || deny("NothingUnsure"),
        },
      },
    },
  },
}));
```

```tsx
// DeleteTicket.tsx
export function DeleteTicketButton({ del }: { del: Actor<typeof TicketDeleteMachine> }) {
  const asking = useView(del, (s) => TicketDelete.S.ASK.is(s));
  const waiting = useView(del, (s) => TicketDelete.S.DELETING.BACKOFF.is(s));
  const lock = useView(del, (s) => s.memory.DELETING?.lastBusy ?? null);   // the routine's slice
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
      {waiting && <p>{lock}, retrying…</p>}
      {error && <p role="alert">{error}</p>}
      {/* del.send(TicketDelete.E.DELETING.Sent())  ← type error: internal */}
    </>
  );
}
```

```ts
// confirm.test.ts and commit-with-retry.test.ts — each routine alone
export const confirmed = story
  .machine(Confirm, { id: "Confirm/yes" })
  .enter().process()                                   // new: the harness's entering edge
  .send(Confirm.E.Yes()).process();

test("Yes returns Confirmed", async () => {
  const run = await confirmed.run();
  expect(run.end.exit).toEqual({ exit: "Confirmed", payload: {} });
});

const Retry = CommitWithRetry({ request: { ticketId: Schema.String }, result: {} }, { maxRetries: 1, backoff: "1 second" });

// Request fixtures are adapter functions run through real operations (Testing O3 unchanged).
export const givesUp = story
  .machine(Retry, {
    id: "CommitWithRetry/gives-up",
    requests: { send: () => Effect.fail({ _tag: "Busy" as const, reason: "Locked" }) },
  })
  .enter({ request: { ticketId: "T-1" } }).process()   // SENDING.start: first send, Busy
  .advance("1 second").process();                      // retry, Busy again: gives up

export const unknownStops = story
  .machine(Retry, { id: "CommitWithRetry/unknown-stops", requests: { send: () => Effect.never } })
  .enter({ request: { ticketId: "T-1" } }).process()   // invoked and held
  .cancel("send").process();                           // new: post-invocation cancel → unknown

test("retries the captured request, then gives up", async () => {
  const run = await givesUp.run();
  expect(run.end.requests).toEqual([
    { request: "send", input: { ticketId: "T-1" } },
    { request: "send", input: { ticketId: "T-1" } },
  ]);
  expect(run.end.exit).toEqual({ exit: "GaveUp", payload: { reason: "Locked", attempts: 1 } });
});

test("an unknown result never sends again", async () => {
  const run = await unknownStops.run();
  expect(run.end.requests).toHaveLength(1);
  expect(run.end.exit?.exit).toBe("Uncertain");
});
```

### 4.5 A poll that runs until the host leaves

New: `live` filling, a read `requests` binding. Extended: `default: S.LIVE.from(...)`, a routine
with input on the admission path (rule 4: the default supplies it, reading the root's initial
memory). `Pause` abandons the routine; a late refresh is dropped (rule 9).

```ts
// board.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Poll } from "./pieces";

export const Board = definition({
  id: "Desk/Board",
  states: {
    PAUSED: {},
    LIVE: Poll({ workspaceId: Schema.String }, {
      every: "5 seconds",
      slowEvery: "1 minute",
      maxBackoff: "5 minutes",
    }),
  },
  events: { Pause: {}, Resume: {}, Focused: {}, Blurred: {} },
  input: { workspaceId: Schema.String },
  memory: { workspaceId: Schema.String, focused: Schema.Boolean },
  initial: ({ input }) => ({ workspaceId: input.workspaceId, focused: true }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// board.machine.ts
import { machine } from "flow-state";
import { Board } from "./board.definition";

export const BoardMachine = machine(Board, ({ S, O }) => {
  // One edge value, used by the default and by Resume.
  const live = S.LIVE.from(({ memory }) => ({ key: { workspaceId: memory.workspaceId } }));
  return {
    default: live,                                     // extended: a default may carry input
    activities: {
      list: O.Tickets.list.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId })),
    },
    on: {
      Focused: { target: "self", updateMemory: () => ({ focused: true }) },
      Blurred: { target: "self", updateMemory: () => ({ focused: false }) },
    },
    states: {
      PAUSED: { on: { Resume: live } },
      LIVE: {
        live: { slow: ({ memory }) => !memory.focused },  // read, never copied into Poll (D1)
        requests: {
          refresh: {
            operation: ({ results }) =>
              O.Tickets.list.refetch(({ payload }) => payload, {
                outcomes: { success: results.Ok, failure: { QueueUnavailable: results.Failed } },
              }),
          },
        },
        on: { Pause: S.PAUSED },                       // abandons Poll
      },
    },
  };
});
```

```tsx
// BoardHeader.tsx
export function BoardHeader({ board }: { board: Actor<typeof BoardMachine> }) {
  const live = useView(board, (s) => Board.S.LIVE.is(s));
  const refreshing = useView(board, (s) => Board.S.LIVE.REFRESHING.is(s));
  const failures = useView(board, (s) => s.memory.LIVE?.failures ?? 0);
  useEffect(() => {
    const onVisibility = () => board.send(document.hidden ? Board.E.Blurred() : Board.E.Focused());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [board]);
  return live ? (
    <>
      {refreshing ? "Refreshing…" : failures > 0 ? `Retrying (failed ${failures}×)` : "Live"}
      <button onClick={() => board.send(Board.E.Pause())}>Pause</button>
    </>
  ) : (
    <button onClick={() => board.send(Board.E.Resume())}>Resume</button>
  );
}
```

```ts
// poll.test.ts — the routine alone: backs off, and stops once left
const BoardPoll = Poll({ workspaceId: Schema.String }, {
  every: "5 seconds",
  slowEvery: "1 minute",
  maxBackoff: "5 minutes",
});

export const backsOff = story
  .machine(BoardPoll, {
    id: "Poll/backs-off",
    live: { slow: () => false },
    requests: { refresh: () => Effect.fail({ _tag: "Failed" as const }) },
  })
  .enter({ key: { workspaceId: "north" } }).process()
  .advanceToNextTimer().process().checkpoint("first")    // 5 s: refresh fails
  .advanceToNextTimer().process().checkpoint("second")   // 15 s: waited 10 s
  .leave().process()                                     // new: the harness abandons it
  .advance("10 minutes").process().checkpoint("left");

test("backs off on failure and stops when left", async () => {
  const run = await backsOff.run();
  expect(run.checkpoints.first.now).toBe(5_000);
  expect(run.checkpoints.second.now).toBe(15_000);
  expect(run.checkpoints.left.requests).toHaveLength(2);
  expect(run.checkpoints.left.piece).toBeUndefined();           // the slice is gone
});
```

### 4.6 Two levels: checkout wizard → address step → two fields

`AddressStep` is a routine containing two `Field` traits and a `verify` read. The wizard binds
`verify` and the `place` commit. A `Cancel` during PLACING records `pending` in the same turn;
`Start` refuses a new order until the old one is known (L7); `Reconcile` resolves it either way.

New: everything in 4.1–4.5. Extended: exit fillings that target a routine with `.from`; `start` on
an inline node of the actor (`RECONCILING`).

```ts
// address-step.ts
import { deny, routine } from "flow-state";
import { Schema } from "effect";
import { Field, isValid } from "./pieces";

export const Address = Schema.Struct({ street: Schema.String, city: Schema.String });
const required = (v: string) => (v.trim() ? null : "Required");

export const AddressStep = routine(
  {
    id: "AddressStep",
    input: { address: Address },
    memory: { problem: Schema.NullOr(Schema.String) },
    initial: () => ({ problem: null }),
    traits: {
      street: Field(Schema.String, { validate: required }),
      city: Field(Schema.String, { validate: required }),
    },
    states: { EDITING: {}, VERIFYING: {} },
    events: { Next: {}, Back: {} },
    internalEvents: { Verified: { address: Address }, Problem: { reason: Schema.String } },
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
        input: ({ input }) => ({ start: input.address.street }),   // rule 5: the step's input
        guards: { canEdit: ({ state }) => state === "EDITING" || deny("Verifying") },
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ problem: null }) } },
      },
      city: {
        input: ({ input }) => ({ start: input.address.city }),
        guards: { canEdit: ({ state }) => state === "EDITING" || deny("Verifying") },
        callbacks: { onChanged: { target: "self", updateMemory: () => ({ problem: null }) } },
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
        draft: { street: memory.street.value, city: memory.city.value },  // D7: the draft returns
      })),
    },
    states: {
      EDITING: {
        on: {
          Next: {
            target: S.VERIFYING,
            guard: ({ memory }) => (isValid(memory.street) && isValid(memory.city)) || deny("Invalid"),
          },
        },
      },
      VERIFYING: {
        start: [requests.verify],
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
import { Attempt, definition } from "flow-state";
import { Schema } from "effect";
import { CommitWithRetry, Confirm } from "./pieces";
import { Address, AddressStep } from "./address-step";

export const PlaceOrder = CommitWithRetry(
  { request: { cartId: Schema.String, address: Address }, result: { orderId: Schema.String } },
  { maxRetries: 2, backoff: "2 seconds" },
);

export const Checkout = definition({
  id: "Shop/Checkout",
  states: {
    CART: {},
    ADDRESS: AddressStep,
    REVIEW: Confirm,
    PLACING: PlaceOrder,
    RECONCILING: {},
    PLACED: {},
    UNSURE: {},
  },
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
import { deny, machine } from "flow-state";
import { Checkout } from "./checkout.definition";

export const CheckoutMachine = machine(Checkout, ({ S, E, O }) => {
  const toAddress = S.ADDRESS.from(({ memory }) => ({ address: memory.address }));
  const toPlacing = S.PLACING.from(({ memory }) => ({
    request: { cartId: memory.cartId, address: memory.address },
  }));
  // RECONCILING's guards ensure `late` is set before this runs.
  const reconcile = O.Orders.place.retry(({ memory }) => memory.late!.attempt, {
    outcomes: {
      success: E.Reconciled,
      failure: {
        PaymentBusy: E.NotPlaced.from(() => ({ reason: "Not placed: payments were busy" })),
        StockChanged: E.NotPlaced.from(() => ({ reason: "Not placed: items changed" })),
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
            target: toAddress,
            guard: ({ memory }) => memory.late === null || deny("PreviousOrderUnresolved"), // L7
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
            },
          ],
        },
      },
      ADDRESS: {
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
          Done: {
            target: S.REVIEW,
            updateMemory: ({ payload }) => ({ address: payload.address, error: null }),
          },
          Back: { target: S.CART, updateMemory: ({ payload }) => ({ address: payload.draft }) },
        },
        on: { Cancel: S.CART },
      },
      REVIEW: {
        exits: { Confirmed: toPlacing, Declined: toAddress },
        on: { Cancel: S.CART },
      },
      PLACING: {
        requests: {
          send: {
            operation: ({ results }) =>
              O.Orders.place.commit(({ payload }) => payload, {
                outcomes: {
                  success: results.Done.from((order) => ({ orderId: order.orderId })),
                  failure: {
                    PaymentBusy: results.Busy.from(() => ({ reason: "Payments are busy" })),
                    StockChanged: results.Rejected.from(() => ({ reason: "Some items are no longer available" })),
                  },
                },
              }),
            abandoned: {
              updateMemory: ({ payload }) => {
                switch (payload.outcome) {
                  case "pending":                      // fused into the Cancel transition itself
                    return { late: { attempt: payload.attempt, status: "Pending" } };
                  case "success":
                    return { late: { attempt: payload.attempt, status: "Placed" } };
                  case "failure":
                  case "notSent":
                    return { late: null };
                  default:                              // unknown, interrupt, defect
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
        on: { Cancel: S.CART },                        // abandons PLACING mid-flight
      },
      RECONCILING: {
        start: [reconcile],                            // extended: an inline node's first action
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
      {/* checkout.send(Checkout.E.ADDRESS.street.Set({ value: "x" }))  ← type error: hostEvent */}
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

```ts
// checkout.story.ts — HeldOrders holds `place` for 2 seconds, then succeeds
export const cancelWhilePlacing = story
  .machine(CheckoutMachine, {
    id: "checkout-cancel-while-placing",
    input: { cartId: "C-1" },
    services: DemoShop,
    fixtures: [HeldOrders],
  })
  .send(Checkout.E.Start())
  .send(Checkout.E.ADDRESS.street.Changed({ value: "1 Main St" }))
  .send(Checkout.E.ADDRESS.city.Changed({ value: "Springfield" }))
  .send(Checkout.E.ADDRESS.Next())
  .process()                                           // verify answers Valid → REVIEW
  .send(Checkout.E.REVIEW.Yes())
  .process()                                           // PLACING: invoked and held
  .send(Checkout.E.Cancel())
  .process()
  .checkpoint("cancelled")
  .advance("2 seconds")
  .process()
  .checkpoint("settled")
  .send(Checkout.E.Reconcile())
  .process()
  .checkpoint("reconciled");

test("leaving a placed order blocks a second one until it is known", async () => {
  const run = await cancelWhilePlacing.run();
  const cancelled = run.checkpoints.cancelled.snapshot;
  expect(Checkout.S.CART.is(cancelled)).toBe(true);
  expect(cancelled.memory.late?.status).toBe("Pending");          // recorded in the Cancel turn
  expect(cancelled.memory.PLACING).toBeUndefined();                // the step's memory is gone
  expect(check(cancelled, Checkout.E.Start())).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "PreviousOrderUnresolved" }],
  });
  expect(run.checkpoints.settled.snapshot.memory.late?.status).toBe("Placed");
  expect(Checkout.S.PLACED.is(run.checkpoints.reconciled.snapshot)).toBe(true);
});
```

### 4.7 Dispatch Desk: the ticket editor, rewritten

What changes, and why:

- **SAVING + LOCKED become one routine instance**, `SAVING: SaveTitle` (a `CommitWithRetry`). The
  lock counter and lock reason are the routine's memory, so the two hand resets of `lockRetries`
  disappear; `RetrySave`, `Saved`, `SaveFailed`, `SaveLocked` and `SaveUncertain` move inside the
  routine or into its exits. `commitDraft`, written on four transitions today, becomes one edge
  value `save` plus `SENDING.start`.
- **The autosave is a `Debounce` trait on OPEN**, not a `restartOn` schedule on EDITING. Finding:
  today's `editedWhileSaving` Story expects an autosave after `Saved` lands in EDITING with a newer
  draft, but Machines O5 says `restartOn` is silent on entry, so that schedule never arms; the same
  trap skips the autosave of the first edit after SAVED (T2). Here every edit and the "draft moved
  on" exit raise `autosave.Input` into a trait that lives across those transitions, so the Story's
  expectation holds.
- **`error` is FAILED's node memory**, entered with `S.OPEN.FAILED.from(...)`. The four
  `error: ""` resets disappear: the field exists only while FAILED is active.
- **A save left mid-flight is recorded by `abandoned`** (Close, Escape, CancelSave, revoked
  permission) instead of root handlers for `Saved` and `SaveUncertain`.
- **The uncertain retry is an inline node with `start`** (`RECONCILING`), using the actor's own
  operation, as today.

Unchanged: `editor.ref.ts`, `useEditor.ts`, the context wiring, `canSave` and its deny codes.

```ts
// editor.definition.ts
// The complete editor vocabulary. Public events are what users and other actors may send;
// internal events come only from this actor's own reactions and outcomes. Events of the SAVING
// step live inside its routine, so nothing outside it can forge a result (H3).
import { Schema } from "effect";
import { Attempt, definition } from "flow-state";
import { CommitWithRetry, Debounce } from "../../../pieces/pieces.js";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { technicianUpdates } from "../ticket.operations.js";

// The confirmed save: sends the title captured when SAVING is entered, backs off while the
// ticket is locked, and returns how it ended. Its attempt counter and lock reason are its own.
export const SaveTitle = CommitWithRetry(
  {
    request: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
    result: { title: Schema.String },
  },
  { maxRetries: 5, backoff: "5 seconds" },
);

export const Editor = definition({
  id: "DispatchDesk/Editor",
  states: {
    OPEN: {
      traits: { autosave: Debounce({ wait: "2 seconds" }) }, // lives exactly as long as OPEN
      states: {
        EDITING: {},
        SAVING: SaveTitle,
        SAVED: {},
        FAILED: {
          input: { reason: Schema.String },
          memory: { error: Schema.String },                  // exists only while FAILED
          initial: ({ input }) => ({ error: input.reason }),
        },
        UNCERTAIN: {},
        RECONCILING: {},
      },
    },
    CLOSED: {},
  },
  events: {
    TitleChanged: { title: Schema.String },
    SaveRequested: {},
    CancelSave: {},
    RefreshRequested: {},
    Escape: {},
    Close: {},
    Reopen: {},
  },
  internalEvents: {
    TicketLoaded: { title: Schema.String },
    PermissionRevoked: {},
    Reconciled: { title: Schema.String },
    ReconcileFailed: { reason: Schema.String },
    StillUncertain: {},
  },
  context: { canEdit: Session.select(({ memory }) => memory.canEdit) },
  input: { workspaceId: Schema.String, ticketId: Schema.String },
  // Actor-lifetime memory: keys, the draft, the last confirmed title, and an unresolved save.
  memory: {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    draft: Schema.String,
    saved: Schema.String,
    uncertain: Schema.NullOr(Attempt),
  },
  initial: ({ input }) => ({
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    draft: "",
    saved: "",
    uncertain: null,
  }),
  operations: { Tickets: TicketsDomain, technicianUpdates },
});
```

```ts
// editor.machine.ts
import { deny, machine, send } from "flow-state";
import { Toasts } from "../../Toasts/toasts.definition.js";
import { ToastsRef } from "../../Toasts/toasts.ref.js";
import { Editor } from "./editor.definition.js";

const MAX_TITLE = 200;

type Memory = typeof Editor.Memory.Type;

const ticketKey = ({ memory }: { memory: Memory }) => ({
  workspaceId: memory.workspaceId,
  ticketId: memory.ticketId,
});

const canSave = ({ memory, context }: { memory: Memory; context: { canEdit: boolean } }) => {
  if (!context.canEdit) return deny("NoPermission");
  if (memory.draft.trim() === "") return deny("EmptyTitle");
  if (memory.draft.length > MAX_TITLE)
    return deny("TitleTooLong", { length: memory.draft.length, max: MAX_TITLE });
  return true;
};

const savedToast = (title: string) => ({ text: `Saved “${title}”` });

export const EditorMachine = machine(Editor, ({ S, E, O }) => {
  // The one way into SAVING: the draft as it is now becomes the request every retry sends.
  const save = S.OPEN.SAVING.from(({ memory }) => ({
    request: { ...ticketKey({ memory }), title: memory.draft },
  }));

  // Re-issues the uncertain attempt itself (same input, same attempt.id), never a new one.
  const reconcile = O.Tickets.saveTitle.retry(({ memory }) => memory.uncertain, {
    outcomes: {
      success: E.Reconciled.from((ticket) => ({ title: ticket.title })),
      failure: {
        TitleRejected: E.ReconcileFailed.from(({ reason }) => ({ reason })),
        TicketNotFound: E.ReconcileFailed.from(() => ({ reason: "This ticket no longer exists" })),
        TicketLocked: E.ReconcileFailed.from(({ lockedBy }) => ({ reason: `Locked by ${lockedBy}` })),
      },
      unknown: E.StillUncertain,
      interrupt: E.StillUncertain,
      defect: E.StillUncertain,
    },
  });

  const toastSaved = send(ToastsRef, Toasts.E.Push.from(({ payload }) => savedToast(payload.title)));
  const toastReconciled = send(ToastsRef, Toasts.E.Push.from(({ event }) => savedToast(event.title)));
  const toastLate = send(
    ToastsRef,
    Toasts.E.Push.from(({ payload }) =>
      savedToast(payload.outcome === "success" ? payload.value.title : ""),
    ),
  );

  return {
    default: S.OPEN,

    onContext: [
      {
        select: ({ context }) => context.canEdit,
        when: (canEdit) => !canEdit,
        event: E.PermissionRevoked,
      },
    ],

    // Root handlers apply in CLOSED too: a reconcile that settles after Close still lands.
    on: {
      PermissionRevoked: { target: S.CLOSED, actions: [O.Tickets.saveTitle.cancel(ticketKey)] },
      Reconciled: {
        target: "self",
        updateMemory: ({ event }) => ({ saved: event.title, uncertain: null }),
        actions: [toastReconciled],
      },
      ReconcileFailed: { target: "self", updateMemory: () => ({ uncertain: null }) },
      StillUncertain: { target: "self" },
    },

    states: {
      OPEN: {
        default: S.OPEN.EDITING,
        traits: {
          autosave: {
            callbacks: {
              // A filling is a total handler: with nothing to save, the firing is consumed.
              onSettled: [
                {
                  target: save,
                  guard: (input) =>
                    input.state !== "OPEN.EDITING"
                      ? deny("NotEditing")
                      : input.memory.draft === input.memory.saved
                        ? deny("NothingToSave")
                        : canSave(input),
                },
                { target: "self" },
              ],
            },
          },
        },
        activities: {
          // The value outcome fires only when the confirmed ticket changes, so `saved` only
          // ever holds what the server confirmed.
          ticket: O.Tickets.ticketById.subscribe(ticketKey, {
            outcomes: { value: E.TicketLoaded.from((ticket) => ({ title: ticket.title })) },
          }),
          progress: O.technicianUpdates.subscribe(ticketKey),
        },
        on: {
          // The server's title becomes the draft only while there are no local edits (D3).
          TicketLoaded: {
            target: "self",
            updateMemory: ({ event, memory }) =>
              memory.draft === memory.saved
                ? { saved: event.title, draft: event.title }
                : { saved: event.title },
          },
          // From EDITING, SAVED, FAILED or UNCERTAIN: editing again, and the autosave restarts.
          // OPEN survives this transition, so its trait may be raised into (rule 12).
          TitleChanged: {
            target: S.OPEN.EDITING,
            updateMemory: ({ event }) => ({ draft: event.title }),
            raise: [E.autosave.Input],
          },
          RefreshRequested: { target: "self", actions: [O.Tickets.ticketById.refetch(ticketKey)] },
          Escape: S.CLOSED,
          Close: S.CLOSED,
        },
        states: {
          EDITING: {
            on: {
              SaveRequested: { target: save, guard: canSave },
              // With edits, Escape discards them; without, it falls through to OPEN and closes.
              Escape: {
                target: "self",
                guard: ({ memory }) => memory.draft !== memory.saved || deny("NothingToDiscard"),
                updateMemory: ({ memory }) => ({ draft: memory.saved }),
              },
            },
          },
          SAVING: {
            requests: {
              send: {
                operation: ({ results }) =>
                  O.Tickets.saveTitle.commit(({ payload }) => payload, {
                    outcomes: {
                      success: results.Done.from((ticket) => ({ title: ticket.title })),
                      failure: {
                        TitleRejected: results.Rejected.from(({ reason }) => ({ reason })),
                        TicketNotFound: results.Rejected.from(() => ({
                          reason: "This ticket no longer exists",
                        })),
                        TicketLocked: results.Busy.from(({ lockedBy }) => ({
                          reason: `Locked by ${lockedBy}`,
                        })),
                      },
                    },
                  }),
                // Left mid-save (CancelSave, Escape, Close, revoked permission): the save still
                // settles, and what it did is recorded wherever the editor is by then.
                abandoned: [
                  {
                    guard: ({ payload }) => payload.outcome === "success" || deny("NotSaved"),
                    updateMemory: ({ payload }) =>
                      payload.outcome === "success"
                        ? { saved: payload.value.title, uncertain: null }
                        : {},
                    actions: [toastLate],
                  },
                  {
                    // pending, failure and notSent leave nothing to keep
                    updateMemory: ({ payload }) =>
                      payload.outcome === "unknown" ||
                      payload.outcome === "interrupt" ||
                      payload.outcome === "defect"
                        ? { uncertain: payload.attempt }
                        : {},
                  },
                ],
              },
            },
            exits: {
              Done: [
                {
                  target: S.OPEN.SAVED,
                  guard: ({ payload, memory }) =>
                    payload.title === memory.draft || deny("DraftMovedOn"),
                  updateMemory: ({ payload }) => ({ saved: payload.title, uncertain: null }),
                  actions: [toastSaved],
                },
                {
                  // Typed during the save: back to EDITING, and the newer draft autosaves.
                  target: S.OPEN.EDITING,
                  updateMemory: ({ payload }) => ({ saved: payload.title, uncertain: null }),
                  actions: [toastSaved],
                  raise: [E.autosave.Input],
                },
              ],
              GaveUp: S.OPEN.FAILED.from(({ payload }) => ({
                reason: `${payload.reason}; gave up after ${payload.attempts} retries`,
              })),
              Rejected: S.OPEN.FAILED.from(({ payload }) => ({ reason: payload.reason })),
              Uncertain: {
                target: S.OPEN.UNCERTAIN,
                updateMemory: ({ payload }) => ({ uncertain: payload.attempt }),
              },
            },
            on: {
              // Typing during a save is kept; it stays unsaved because Done compares it.
              TitleChanged: { target: "self", updateMemory: ({ event }) => ({ draft: event.title }) },
              CancelSave: {
                target: S.OPEN.EDITING,
                actions: [O.Tickets.saveTitle.cancel(ticketKey)],
              },
            },
          },
          SAVED: {},
          FAILED: {
            on: { SaveRequested: { target: save, guard: canSave } },
          },
          // The save may or may not have reached the server; retrying reuses the same attempt.
          UNCERTAIN: {
            on: {
              SaveRequested: {
                target: S.OPEN.RECONCILING,
                guard: ({ memory }) => memory.uncertain !== null || deny("NothingToRetry"),
              },
            },
          },
          RECONCILING: {
            start: [reconcile],
            on: {
              TitleChanged: { target: "self", updateMemory: ({ event }) => ({ draft: event.title }) },
              Reconciled: [
                {
                  target: S.OPEN.SAVED,
                  guard: ({ event, memory }) => event.title === memory.draft || deny("DraftMovedOn"),
                  updateMemory: ({ event }) => ({ saved: event.title, uncertain: null }),
                  actions: [toastReconciled],
                },
                {
                  target: S.OPEN.EDITING,
                  updateMemory: ({ event }) => ({ saved: event.title, uncertain: null }),
                  actions: [toastReconciled],
                  raise: [E.autosave.Input],
                },
              ],
              ReconcileFailed: {
                target: S.OPEN.FAILED.from(({ event }) => ({ reason: event.reason })),
                updateMemory: () => ({ uncertain: null }),
              },
              StillUncertain: S.OPEN.UNCERTAIN,
            },
          },
        },
      },
      CLOSED: { on: { Reopen: S.OPEN } },
    },
  };
});
```

`editor.ref.ts` and `useEditor.ts` are unchanged. `TicketPanel.tsx`, in full:

```tsx
// TicketPanel.tsx
import type { ReactNode } from "react";
import { check } from "flow-state";
import { useView } from "flow-state/react";
import type { TicketKey } from "../types.js";
import { Editor } from "./editor.definition.js";
import { useEditor, type EditorCommands } from "./useEditor.js";

const { S, E } = Editor;

export function TicketPanel({ ticket }: { ticket: TicketKey }) {
  const commands = useEditor(ticket);
  const top = useView(commands.editor, (s) => S.root.child(s)); // "OPEN" | "CLOSED"

  const body = {
    OPEN: <OpenTicket commands={commands} />,
    CLOSED: <ClosedTicket commands={commands} />,
  } satisfies Record<typeof top, ReactNode>;

  return (
    <section onKeyDown={(event) => event.key === "Escape" && commands.escape()}>
      {body[top]}
    </section>
  );
}

function OpenTicket({ commands }: { commands: EditorCommands }) {
  const step = useView(commands.editor, (s) => S.OPEN.child(s));

  const status = {
    EDITING: null,
    SAVING: <SaveProgress commands={commands} />,
    SAVED: <span role="status">Saved</span>,
    FAILED: <ErrorNotice commands={commands} />,
    UNCERTAIN: null, // UncertainNotice below covers it, in CLOSED too
    RECONCILING: <span role="status">Checking your last save…</span>,
  } satisfies Record<typeof step, ReactNode>;

  return (
    <>
      <TicketHeader commands={commands} />
      <TitleField commands={commands} />
      <footer>
        <SaveButton commands={commands} />
        {status[step]}
        <button onClick={commands.close}>Done</button>
      </footer>
      <UncertainNotice commands={commands} />
    </>
  );
}

function TicketHeader({ commands }: { commands: EditorCommands }) {
  const title = useView(commands.editor, (s) =>
    S.OPEN.is(s) ? s.activities.ticket?.data?.title : undefined,
  );
  const stage = useView(commands.editor, (s) =>
    S.OPEN.is(s) ? s.activities.progress?.data?.stage : undefined,
  );
  const loadFailed = useView(
    commands.editor,
    (s) => S.OPEN.is(s) && s.activities.ticket?._tag === "Failure",
  );

  if (loadFailed && title === undefined) {
    return (
      <p role="alert">
        This ticket could not be loaded. <button onClick={commands.refresh}>Try again</button>
      </p>
    );
  }

  return (
    <header>
      <h2>{title ?? "Loading…"}</h2>
      {stage && <span className="badge">Technician {stage}</span>}
    </header>
  );
}

function TitleField({ commands }: { commands: EditorCommands }) {
  const draft = useView(commands.editor, (s) => s.memory.draft);
  return (
    <label>
      Title
      <input value={draft} maxLength={240} onChange={(event) => commands.rename(event.target.value)} />
    </label>
  );
}

const saveHints = new Map([
  ["TitleTooLong", "Titles are limited to 200 characters."],
  ["EmptyTitle", "A ticket needs a title."],
  ["NoPermission", "You can view this ticket but not edit it."],
]);

function SaveButton({ commands }: { commands: EditorCommands }) {
  const save = useView(commands.editor, (s) => check(s, E.SaveRequested()));
  const hint =
    save._tag === "Denied"
      ? save.reasons.map((reason) => saveHints.get(reason.code)).find(Boolean)
      : undefined;
  return (
    <>
      <button disabled={save._tag !== "Allowed"} onClick={commands.save}>
        Save
      </button>
      {hint && <p className="hint">{hint}</p>}
    </>
  );
}

// SAVING is a routine instance: its slice is readable (never writable) from outside.
function SaveProgress({ commands }: { commands: EditorCommands }) {
  const waiting = useView(commands.editor, (s) => S.OPEN.SAVING.BACKOFF.is(s));
  const lock = useView(commands.editor, (s) => s.memory.SAVING?.lastBusy ?? null);
  return (
    <>
      <button onClick={commands.cancel}>Cancel</button>
      {waiting && lock && <p role="status">{lock}. Retrying automatically…</p>}
    </>
  );
}

// FAILED's error is node memory: the narrowing token makes it a string, and it cannot be stale.
function ErrorNotice({ commands }: { commands: EditorCommands }) {
  const error = useView(commands.editor, (s) => (S.OPEN.FAILED.is(s) ? s.memory.error : ""));
  return <p role="alert">{error}</p>;
}

function UncertainNotice({ commands }: { commands: EditorCommands }) {
  const uncertain = useView(commands.editor, (s) => s.memory.uncertain !== null);
  const canRetry = useView(commands.editor, (s) => S.OPEN.UNCERTAIN.is(s));
  if (!uncertain) return null;
  return (
    <p role="status">
      We couldn't confirm your last save.{" "}
      {canRetry && <button onClick={commands.save}>Retry the same save</button>}
    </p>
  );
}

function ClosedTicket({ commands }: { commands: EditorCommands }) {
  const title = useView(commands.editor, (s) => s.memory.saved);
  return (
    <>
      <h2>{title}</h2>
      <button onClick={commands.reopen}>Edit</button>
      <UncertainNotice commands={commands} />
    </>
  );
}
```

Stories: `desk`, `saved`, `autosaved`, `emptyTitle`, `escaped`, `revokedWhileSaving`, the focused
Stories and `exploreEditor` are unchanged. The two that touch the changed parts:

```ts
// editor.story.ts (excerpt of exported Stories whose meaning changed; the file is otherwise as today)
export const editedWhileSaving = desk("ticket-edit-while-saving")
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }))
  .send(Editor42, E.SaveRequested())
  .process()
  .send(Editor42, E.TitleChanged({ title: "Replace foyer lights" }))
  .advance("2 seconds")
  .process()
  .checkpoint("saved-with-newer-draft")
  .advance("2 seconds") // the debounce, re-armed by the "draft moved on" exit
  .process()
  .checkpoint("autosaving-newer-draft")
  .advance("2 seconds")
  .process()
  .checkpoint("newer-draft-saved");

export const lockedOut = desk("ticket-locked", [LockedSave])
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }))
  .send(Editor42, E.SaveRequested())
  .process()
  .checkpoint("locked")
  .advanceToNextTimer()
  .process()
  .checkpoint("first-retry")
  .advance("10 minutes")
  .process()
  .checkpoint("gave-up");
```

```ts
// editor.test.tsx (the two changed tests)
test("an edit made during a save stays unsaved, and is autosaved next", async () => {
  const run = await editedWhileSaving.run();
  const after = run.checkpoints["saved-with-newer-draft"].actor(Editor42).snapshot;
  expect(after.memory.saved).toBe("Replace foyer light");
  expect(after.memory.draft).toBe("Replace foyer lights");
  expect(S.OPEN.EDITING.is(after)).toBe(true);
  // Today this expectation contradicts Machines O5 (restartOn is silent on entry); here the
  // autosave trait was re-armed by the Done exit's raise, so it holds.
  expect(S.OPEN.SAVING.is(run.checkpoints["autosaving-newer-draft"].actor(Editor42).snapshot)).toBe(true);
  const done = run.checkpoints["newer-draft-saved"].actor(Editor42).snapshot;
  expect(S.OPEN.SAVED.is(done)).toBe(true);
  expect(done.memory.saved).toBe("Replace foyer lights");
});

test("a held lock backs off inside the save step, then gives up", async () => {
  const run = await lockedOut.run();
  const locked = run.checkpoints.locked.actor(Editor42).snapshot;
  expect(S.OPEN.SAVING.BACKOFF.is(locked)).toBe(true);
  expect(locked.memory.SAVING?.lastBusy).toBe("Locked by dispatcher-2");
  expect(run.checkpoints["first-retry"].actor(Editor42).snapshot.memory.SAVING?.attempts).toBe(2);

  const last = run.checkpoints["gave-up"].actor(Editor42).snapshot;
  expect(S.OPEN.FAILED.is(last) && last.memory.error).toBe(
    "Locked by dispatcher-2; gave up after 5 retries",
  );
  expect(last.memory.SAVING).toBeUndefined(); // nothing to reset: the step's memory left with it
  // @ts-expect-error Retry is the SAVING routine's internal event: no path reaches it from here.
  check(last, E.SAVING.Retry());

  const saves = run.trace.filter(
    (event) => event._tag === "CommitStarted" && event.write === "tickets.saveTitle",
  );
  expect(saves).toHaveLength(6); // one save and five retries; it gives up on the sixth Busy
});
```

Behaviour differences from today, all deliberate: a retry after a lock sends the title captured
when SAVING was entered (D2), and a newer draft is saved by the autosave once the step returns;
the step gives up right after the sixth `Busy` rather than after one more backoff wait; a
definitive failure of the uncertain retry clears `uncertain` (the server refused it).

### 4.8 Dispatch Desk: the queue, rewritten

The queue is an ordinary machine with no reusable parts, and it shows the migration cost for most
machines: the definition's `states` list becomes a record. Nothing else changes.

```ts
// queue.definition.ts — the only changed line is `states`
import { Schema } from "effect";
import { definition } from "flow-state";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { TicketStatus } from "../types.js";

export const Queue = definition({
  id: "DispatchDesk/Queue",
  states: { HEALTHY: {}, DEGRADED: {} },              // extended: was ["HEALTHY", "DEGRADED"]
  events: {
    SearchChanged: { search: Schema.String },
    StatusChanged: { status: Schema.NullOr(TicketStatus) },
    MineOnlyToggled: {},
    LoadMore: {},
    AssignToMe: { ticketId: Schema.String },
  },
  internalEvents: {
    PollDue: {},
    ListLoaded: {},
    ListUnavailable: { retryAfter: Schema.Number },
    AssignFailed: { reason: Schema.String },
  },
  context: { userId: Session.select(({ memory }) => memory.userId) },
  input: { workspaceId: Schema.String },
  memory: {
    workspaceId: Schema.String,
    search: Schema.String,
    status: Schema.NullOr(TicketStatus),
    mineOnly: Schema.Boolean,
    notice: Schema.String,
  },
  initial: ({ input }) => ({
    workspaceId: input.workspaceId,
    search: "",
    status: null,
    mineOnly: false,
    notice: "",
  }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// queue.machine.ts — unchanged, shown in full
import { Schedule } from "effect";
import { deny, machine } from "flow-state";
import type { TicketListInput } from "../types.js";
import { Queue } from "./queue.definition.js";

type Memory = typeof Queue.Memory.Type;

export const listInput = ({
  memory,
  context,
}: {
  memory: Memory;
  context: { userId: string };
}): TicketListInput => ({
  workspaceId: memory.workspaceId,
  status: memory.status ?? undefined,
  assignee: memory.mineOnly ? context.userId : undefined,
  search: memory.search === "" ? undefined : memory.search,
});

const workspace = ({ memory }: { memory: Memory }) => ({ workspaceId: memory.workspaceId });

type Lanes = {
  list?: {
    hasMore: boolean;
    data?: ReadonlyArray<{ tickets: ReadonlyArray<{ ticketId: string; status: string }> }>;
  };
};

const hasMorePages = ({ activities }: { activities: Lanes }) =>
  activities.list?.hasMore === true || deny("NoMorePages");

const canAssign = ({ activities, event }: { activities: Lanes; event: { ticketId: string } }) => {
  const row = activities.list?.data
    ?.flatMap((page) => page.tickets)
    .find((ticket) => ticket.ticketId === event.ticketId);
  return row === undefined
    ? deny("NotListed")
    : row.status === "open" || deny("NotOpen", { status: row.status });
};

export const QueueMachine = machine(Queue, ({ S, E, O }) => ({
  default: S.HEALTHY,

  activities: {
    list: O.Tickets.list.subscribe(listInput, {
      outcomes: {
        value: E.ListLoaded,
        failure: { QueueUnavailable: E.ListUnavailable.from(({ retryAfter }) => ({ retryAfter })) },
      },
      placeholder: ({ previous, input }) =>
        previous?.input.status === input.status && previous.input.assignee === input.assignee
          ? previous.data
          : undefined,
    }),
    open: O.Tickets.openCount.subscribe(workspace),
    feed: O.Tickets.events.subscribe(workspace),
  },

  on: {
    SearchChanged: { target: "self", updateMemory: ({ event }) => ({ search: event.search }) },
    StatusChanged: { target: "self", updateMemory: ({ event }) => ({ status: event.status }) },
    MineOnlyToggled: {
      target: "self",
      updateMemory: ({ memory }) => ({ mineOnly: !memory.mineOnly }),
    },
    LoadMore: { target: "self", guard: hasMorePages, actions: [O.Tickets.list.more(listInput)] },
    PollDue: { target: "self", actions: [O.Tickets.list.refetch(listInput)] },
    AssignToMe: {
      target: "self",
      guard: canAssign,
      updateMemory: () => ({ notice: "" }),
      actions: [
        O.Tickets.assign.commit(
          ({ memory, context, event }) => ({
            workspaceId: memory.workspaceId,
            ticketId: event.ticketId,
            assignee: context.userId,
          }),
          {
            outcomes: {
              failure: {
                TicketNotFound: E.AssignFailed.from(() => ({ reason: "That ticket was removed" })),
              },
            },
          },
        ),
      ],
    },
    AssignFailed: { target: "self", updateMemory: ({ event }) => ({ notice: event.reason }) },
  },

  states: {
    HEALTHY: {
      schedules: { poll: { schedule: Schedule.spaced("30 seconds"), send: E.PollDue } },
      on: { ListUnavailable: S.DEGRADED },
    },
    DEGRADED: {
      schedules: {
        poll: {
          schedule: Schedule.min([
            Schedule.exponential("5 seconds").pipe(Schedule.jittered),
            Schedule.spaced("5 minutes"),
          ]),
          send: E.PollDue,
        },
      },
      on: { ListLoaded: S.HEALTHY },
    },
  },
}));
```

`queue.ref.ts`, `QueueList.tsx`, the Stories, the SSR Story and the tests are unchanged: every
read the component makes (`S.DEGRADED.is(s)`, `s.memory.search`, `s.memory.notice`,
`s.activities.list`, `s.activities.open?.data`, `check(s, E.LoadMore())`,
`check(s, E.AssignToMe(...))`, `Ticket.get(s, ...)`) and every send has the same type and value.
The component that sends and reads, with its Story test, for the record:

```tsx
// QueueList.tsx (top-level component and toolbar; QueueBody, Rows and TicketRowItem as today)
export function QueueList({ workspaceId, onOpen }: { workspaceId: string; onOpen: (t: TicketKey) => void }) {
  const queue = useActorByRef(queueRef(workspaceId), { input: { workspaceId } });
  const reconnecting = useView(queue, (s) => S.DEGRADED.is(s));
  const notice = useView(queue, (s) => s.memory.notice);
  return (
    <section aria-label="Ticket queue">
      <Toolbar queue={queue} />
      {reconnecting && <p role="status">Reconnecting to the queue…</p>}
      {notice && <p role="alert">{notice}</p>}
      <QueueBody queue={queue} onOpen={onOpen} />
    </section>
  );
}

function Toolbar({ queue }: { queue: QueueActor }) {
  const search = useView(queue, (s) => s.memory.search);
  const status = useView(queue, (s) => s.memory.status);
  const mineOnly = useView(queue, (s) => s.memory.mineOnly);
  const open = useView(queue, (s) => s.activities.open?.data);
  return (
    <div className="toolbar">
      <input
        type="search"
        value={search}
        placeholder="Search tickets"
        onChange={(event) => queue.send(E.SearchChanged({ search: event.target.value }))}
      />
      <select
        value={status ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          queue.send(E.StatusChanged({ status: Schema.is(TicketStatus)(value) ? value : null }));
        }}
      >
        <option value="">All</option>
        <option value="open">Open</option>
        <option value="assigned">Assigned</option>
        <option value="closed">Closed</option>
      </select>
      <label>
        <input type="checkbox" checked={mineOnly} onChange={() => queue.send(E.MineOnlyToggled())} />
        Assigned to me
      </label>
      {open !== undefined && <span className="badge">{open} open</span>}
    </div>
  );
}
```

```ts
// queue.story.ts / queue.test.ts (unchanged)
export const degraded = desk("queue-degraded", [UnavailableQueue])
  .checkpoint("degraded")
  .advanceToNextTimer()
  .process()
  .checkpoint("first-backoff-poll");

test("an unavailable list degrades the queue and backs off", async () => {
  const run = await degraded.run();
  expect(S.DEGRADED.is(run.checkpoints.degraded.actor(North).snapshot)).toBe(true);
  expect(run.checkpoints["first-backoff-poll"].now).toBeLessThan(10_000);
  expect(S.DEGRADED.is(run.checkpoints["first-backoff-poll"].actor(North).snapshot)).toBe(true);
});
```

`Session` and `Toasts` change the same way: `states: ["AVAILABLE", "SIGNED_OUT"]` becomes
`states: { AVAILABLE: {}, SIGNED_OUT: {} }`, and `states: ["EMPTY", "SHOWING"]` becomes
`states: { EMPTY: {}, SHOWING: {} }`. Their machines are unchanged.

### 4.9 How a piece is tested alone

`story.machine(piece, { id, input?, live?, guards?, requests? })` wraps a trait or routine in a
generated **harness actor** (fixtures, not injection, as codex-split):

- The harness root holds the piece: a trait at the root, or a routine as the harness's only
  state, entered by `.enter(input)` and abandoned by `.leave()`. `start` therefore runs on a real
  transition, never at admission.
- The piece's `events` and `hostEvents` are the harness's public events at the same paths.
  `guards` and `live` are filled from the options; callbacks are filled with recording handlers.
- Each request is bound to a generated transaction (commit) or resource (read) whose adapter is
  the given function `(payload, { attempt }) => Effect`; failure tags must name the request's
  failure results. Outcomes arise through real paths: success, tagged failure, `Effect.die`,
  `Effect.interrupt`, and `.cancel(request)` on a held fixture (after invocation: `unknown`).
  `abandoned` is filled by the harness and recorded.
- Cuts expose `snapshot` (the harness actor), `piece` (the piece's slice, undefined when
  inactive), `exit`, `calls`, `requests` and `abandoned`. `notSent` needs a real concurrency
  conflict, so it is proven in an App Story.

---

## 5. Feature coverage against today's machine API

"Same" means the behaviour and the authoring form are unchanged; "same, extended" means unchanged
for existing code and also available in more places.

### 5.1 Machines.plan

| Feature (plan) | This model | Verdict |
| --- | --- | --- |
| O1 `definition`/`machine` are synchronous, inert; one FlowError with all violations in order | Same; `trait`/`routine` construction follows the same rule | same |
| O1 machine callback runs once with `{ S, E, O }` | Same; piece bodies run once with `{ S, E, requests, exits, guards, callbacks }` | same |
| O1 `id`, `states`, `events` required; `states` is an ordered list of leaves and compounds | `states` is an ordered record of node contracts; a routine value is a node | **worse** (migration of every definition) / better (nodes carry contracts) |
| O1 `events` and `internalEvents`; overlap rejected | Same; pieces add `hostEvents` | same, extended |
| O1 `input` / `memory` / `initial` rules; `initial` pure, once, never on restore; input unavailable after | Same at the root; the same rules at every node, run on each entry | **better** |
| O1 `context` via `Provider.select`; binding is Runtime O5 | Same, actor only; pieces read host values through `live` | same |
| O1 `operations` flat record of handles | Same, actor only; pieces declare `requests` | same |
| O1 machine mirrors the tree; `default` per compound; leaves have neither | Same; `default` may carry `.from` | same, extended |
| O1 nodes declare `on`, `activities`, `schedules`; only root declares `onContext` | Same; plus `traits`, `start`, node memory; activities only in the actor's piece | same, extended |
| O1 validation: unknown fields, duplicates, reserved names, `_tag` fields, 10-segment paths, name bytes | Same; routine internals count toward the 10 segments; names unique per piece across events, memory and instances | same (deep nesting reaches the limit sooner) |
| O1 machine cannot add states/events/operations; foreign tokens reject; static targets; activity dependency order | Same; foreign piece tokens reject; a piece's internal tokens are not targets | same |
| O1 inference without assertions; Event/State/Input/Memory/Snapshot Schemas; `E.X` validates | Same; Memory Schema includes optional node fields and instance slices; `E` has instance paths | same, extended (**worse**: bigger types) |
| O2 exactly one active leaf | Same: traits have no states, routines are states | same |
| O2 substates share the actor's memory, context and lifetime | Substates see their ancestors' memory and may own memory scoped to themselves | **better** |
| O2 `S.X.is`, `.child`, `S.root.child` | Same; `.is` also narrows node memory | same, extended |
| O2 `on` forms, `target` required, `"self"` | Same; fillings use the same shape | same |
| O2 leaf-first fallthrough; first passing alternative | Same within a piece; a piece's events never fall into its host | same, extended |
| O2 `"self"`, re-entry, unchanged boundary, exit/entry order, parents' work first, defaults in one publication | Same; node memory and traits follow the same order (rule 3) | same |
| O3 pre-turn reads; updates before action parameters; one shallow patch | Same; patch keys route to their owning node; nodes entered this turn read fresh (rule 5) | same, extended |
| O3 one `now` per turn; guards get no time | Same | same |
| O3 whole batch validates; one invalid action rejects the turn | Same, over the fused transition | same |
| O3 unhandled/denied publish nothing | Same | same |
| O3 pre-commit and post-commit callback defects | Same; a request outcome mapper defect also delivers `defect` | same, extended |
| O3 outside callers send only public events; determinism | Same; `hostEvents` and piece `internalEvents` are not sendable | same |
| O4 guards return `true` or `deny(code, context?)` | Same; declared `guards` ports are filled with the same functions | same |
| O4 `check()` verdicts and reasons; no effects | Same; it evaluates raise payload mappers to reach child guards (opus-split amendment) | same, extended |
| O5 schedule declaration, Duration/Schedule/callback, `send`, metadata | Same; on any node of any piece; callbacks may read `live` | same, extended |
| O5 entry arms, exit cancels, descendants and `"self"` preserve | Same | same |
| O5 a firing whose activation ended is discarded | Same, plus an arming id: a firing queued before a restart is discarded | **better** |
| O5 equal deadlines: admission order, outermost state, declaration order | Same, with traits ordered after their node's own schedules | same (one more tie-break) |
| O5 `restartOn` baseline silent on entry; debounce | Same for inline schedules; the trait form cannot be raised into on its entering transition (rule 12) | same, extended (T2 trait form prevented) |
| O5 restore and resume of deadlines; baselines silent | Same; arming ids persist | same |
| O6 `activities` with params, `when`, `placeholder`, lanes | Same, in the actor's piece only (pieces do no I/O) | same |
| O6 finite outcomes map to events; late outcomes reach the actor's later state | Same for the actor's piece; requests are fenced per piece activation and abandoned commits go to `abandoned` | same, extended (**better** for pieces) |
| O6 lane-only changes run no handlers | Same | same |
| O7 `onContext` at the root: silent baselines, waves, `when`, defects | Same, actor root only | same |
| O8 snapshot: `state`, `memory`, `context`, `issues`, `lifecycle`, `activities`; frozen; identities; issue clearing | Same fields; `memory` gains absent-when-inactive node fields and instance slices | same (memory type wider) |

### 5.2 Machine-facing capabilities in other plans

| Feature (plan) | This model | Verdict |
| --- | --- | --- |
| Runtime O1 closed app list, no child actors | Same; pieces are inlined | same |
| Runtime O3 `actorRef`, `ensureActor`, `createActor`, first input wins | Same | same |
| Runtime O4 mailbox, FIFO, `send` action, `SendTargetAbsent` | Same; `send` only in the actor's piece | same |
| Runtime O5 context propagation, diamonds, defects | Same; `live` selectors read context in the host's turn | same |
| Runtime O6 disposal: queued dropped, schedules cancel, commits settle | Same; piece activations end with the incarnation | same |
| Operations O2/O3 lookup, refetch, commit, retry, cancel, writes, optimistic | Same in the actor's piece; pieces reach them through request bindings | same |
| Operations O2 optional outcome members | Same for actor actions; request bindings must map `success` and every failure tag | same, extended |
| Operations O3/O7 `reject` and pre-invocation cancel are silent | Same for actor actions; request-bound commits report `notSent` | **better** (L6) |
| Operations O3 `unknown(Attempt)` | Same; request-bound `interrupt` and `defect` also carry the Attempt | same, extended |
| Persistence O2 state, memory, bindings, schedule deadlines, baselines, pending outcomes | Same; plus node memory, activation, call and arming ids, durable `abandoned` records | same, extended (records larger) |
| Persistence O4 restore never runs `initial` or replays work | Same; nor `start`, nor trait input | same |
| Persistence O6 Attempt durability | Same for request-bound commits | same |
| ServerRendering O3 transfer state, memory, schedules; shape digest | Same; the digest covers piece ids and contracts | same, extended |
| ServerRendering O5 activation never replays initial or finite work | Same; never runs `start` | same |
| React O2 pre-attach snapshot: default states, `initial(input)` memory | Same; also runs node `initial` and pure `default` `.from` mappers along the default path | same, extended |
| React O4 `useView` selectors, `check` in views, token narrowing | Same API; node fields need narrowing (`S.OPEN.FAILED.is(s) ? s.memory.error : ...`) | same (**slightly worse** ergonomics for node fields) |
| React `useActor`, `useActorByRef` | Same | same |
| Testing O1 `story.machine`, `story.app`, commands, `setContext` | Same; `story.machine` also accepts pieces, with `.enter`, `.leave`, `.cancel` | same, extended |
| Testing O4 checkpoints, StoryFrame | Same | same |
| Testing O5 `model`, shortest paths | Same; outcome and timer candidates include pieces' | same |
| Inspection O1 Model: states, transitions, guards, deny codes, schedules, activities, outcome edges, sends | Same; plus pieces, ports, fillings, request and `abandoned` edges, node memory ownership | **better** |
| Inspection O1 `inspect(runtime)` | Same; plus activation, call and arming ids | same, extended |
| Inspection O6 mermaid per machine | Same; piece instances are collapsible clusters | same, extended |
| CommandLine O1 `flow explain` | Same; shows fused fillings and guard ports | same, extended |
| CommandLine O5 `flow check` | Same; plus section 7 | same, extended |
| LazyFeatures, EntityDomains | Unaffected: actors keep the definition/machine split | same |

**Lost:** nothing that exists today. Two things become impossible that are possible today: a
transition targeting deep inside an input-taking node it would enter (it must name the node), and
a guard or update reading a sibling node's memory (there is none while the sibling is inactive).

---

## 6. Against the problems

"Prevents" means types, construction or a `flow check` error. Otherwise "by convention" or
"allows". Differences from opus-split are marked **Δ**.

| # | Verdict | How |
| --- | --- | --- |
| L1 stale timers | **prevents** | Schedules belong to node activations (rule 3); arming ids discard firings queued before a restart. |
| L2 late results | **prevents** | Results carry call ids and reach only their current activation (rule 9). |
| L3 leftover memory | **prevents** in pieces and for node fields; **by convention** whether a host field is put on its node | Every node's memory starts from `initial` on entry. **Δ** opus-split prevents it only inside fragments; here any node can (editor `error`, `lockRetries`). Check 18 suggests moves. |
| L4 no way out | **prevents** | Any host transition at or above an instance abandons it; check 5. |
| L5 abandoned effects | **prevents** (route); by convention (policy) | `abandoned` is required, durable and owned by the binder. |
| L6 silent admission | **prevents** | `notSent`; one outstanding call per request. |
| L7 departure gap | **prevents** (information); by convention (the guard) | `pending` is fused into the leaving transition; Checkout's `Start` guard is host code. |
| L8 phantom replies | **prevents** | Call ids; Stories obtain results only through fixtures. |
| E1 broken invariants | **prevents** | Only declared `guards` refuse a piece's events; fillings are total, so a callback cannot veto (rule 8). |
| E2 interfaces growing with depth | **prevents**, except public events by choice | Ports stop at each level; public events reach their owner directly. |
| E3 hidden endings | **prevents** | Only exits return; a routine's callbacks cannot target (rule 8). |
| E4 refusal by forwarding | **prevents** | Nothing forwards public events; a declined raise declines its source and `check()` shows it. |
| E5 preempting observers | **prevents** | `abandoned` cannot target, raise or call callbacks (types). |
| H1 bypassed policy | **by the author's choice** | `hostEvents` when the host must mediate; public `events` otherwise. |
| H2 unforeseen checks | **allows, by choice** | Declare a guard port, or write the behaviour in the host. |
| H3 faked results | **prevents** | Exits are taken, not sent; piece `internalEvents` come only from its schedules and result maps. |
| H4 misrouted results | **prevents** (host side); flow check (piece side) | Result tokens are class-branded and exist only in `operation`; check 12. |
| H5 interrupt as not-sent | **prevents** | `interrupt` carries the Attempt and differs from `notSent`; check 12 errors on a resend. |
| D1 drifting copies | **prevents** | Slices are readable everywhere; `live` instead of pushes; ancestors' memory is in scope for descendants. |
| D2 live values too late | **prevents** | Entry input is frozen by `.from`; request selects read only `payload` (types). |
| D3 feedback loops | **by convention** | Server values arrive as `hostEvents` or through a guarded update (editor `TicketLoaded`). |
| D4 unmapped outcomes | **prevents** | Host maps success and tags, piece maps the standard outcomes; mapper throws deliver `defect`. |
| D5 restore in flight | **prevents** | Activation, call and arming ids and `abandoned` records persist; pending reads restore as `interrupt`. |
| D6 same-turn seeding | **prevents** for the event or exit payload; **by convention** for the same turn's patch | `.from` is typed by the exact event or payload. **Δ** opus-split's staged read also sees the patch; here derive both from the event. |
| D7 drafts lost on abnormal endings | **allows** | Exits can carry drafts (AddressStep `Back`); abandoning drops piece memory by design. |
| T1 partial turns | **prevents** | One fused transition; whole-transition decline; terminal totality. |
| T2 schedule traps | **prevents** the trait form; **check warns** for inline `restartOn` | Raising into a trait whose node the same transition enters is a construction error, so a debounce must live on a node that survives the edit. **Δ** opus-split: allows, check warns. |
| A1 compounding forwarding | **prevents** | Public events at the instance path; no ancestor re-declares them. |
| A2 two unrelated blocks | **mostly prevents** | One block per instance holds ports, exits and host handlers; entry input sits on the edge (`S.X.from`). **Δ** the trade the round-2 reviewers chose; a named edge value (`toAddress`) keeps it close. |
| A3 conditional rules | **prevents** | Two constructors, two placements; no "if mounted" rules. Inline versus named nodes differ by one rule (lexical scope). |
| A4 overloaded words | **prevents** | `.from` keeps one meaning: "supply this token's declared data". `context`, `outcomes`, `activities` unchanged. |
| A5 I/O inside fragments | **prevents** | `O`, `activities`, `send` exist only in the actor's piece (rule 2). |
| A6 silence discovered late | **prevents** | Every port is filled; a callback ignored is written `{ target: "self" }`. |
| A7 forgotten first send | **prevents** | `start` on the node that waits; check 4 (stuck waiting). |

---

## 7. `flow check` and `flow graph`

**Errors**

1. **Type mirror.** Every type rule above for untyped callers: placement, unfilled ports, result
   token origin and class, exhaustive maps, callback targets, I/O outside the actor's piece, name
   uniqueness per piece, deny-code literals.
2. **Input entry.** A target or `default` entering an input node without `.from`, or a target
   passing through an input node it would enter.
3. **`start` on the admission path.**
4. **Stuck waiting (A7, L6).** A node reachable with a request outstanding that neither handles
   each result unguarded nor leaves; a node that only handles results, reachable with nothing
   outstanding.
5. **No way out (L4).** A routine with no reachable exit and no host transition that can leave it.
6. **Non-total filling.** An exit, callback or `abandoned` filling whose last alternative is
   guarded (types catch inline lists; check catches shared ones).
7. **Terminal totality (T1).** A raise reachable from a result handler, a filling or a timer-fired
   handler into a `hostEvent` the child does not handle unguarded at its root or in every leaf.
8. **Raise structure.** A raise cycle; a raise into an instance entered or left by the same
   transition (this is the T2 trait trap); two fused parts with non-`"self"` targets.
9. A `hostEvent` with no handler at the piece root and none in some leaf.
10. A path that issues a request while a call to it may be outstanding.
11. A relay whose kind, success or failure differs.
12. **H4/H5.** A commit's `unknown`, `interrupt` or `defect` mapped to an event whose handler can
    reach a fresh send of the same request in the same activation.
13. A callback target outside its piece's placement node.

**Warnings and information**

14. A public piece event unhandled in a reachable state of that piece.
15. A dead port: a guard never used, a callback never called, a request never sent or relayed, an
    exit never reached.
16. An exit taken while one of the piece's commits may be outstanding (its result goes to
    `abandoned`).
17. **T2, inline form.** A node whose only progress is a `restartOn` schedule and that is entered
    by the edit meant to trigger it.
18. **Memory placement (L3), from type facts.** A root field whose writes (patch keys read from
    `updateMemory` return types, as deny codes are read from guard types) all occur inside one
    node's subtree and include a write on every edge entering that node: "consider node memory".
19. A piece used by only one machine.
20. A piece contract change without a persistence version bump (`flow diff`).

**What `flow check` cannot prove:** what closures compute (guards, selectors, handlers; D3);
whether host code uses `abandoned` to stop a second submit (L5, L7); whether exits carry drafts
(D7); whether a field "should" survive its node (check 18 is a hint).

**`flow graph`**

- Each node shows the memory it owns, so "where does `error` live?" is answered by the picture.
- Each piece instance is a collapsible cluster labelled `instance: Id (trait|routine)`; traits are
  drawn on the node they attach to.
- Edges into input nodes are labelled with the input fields they supply; `start` actions are drawn
  on the node, once, instead of on every entering edge.
- Request edges go to the bound operation, with result back-edges; `abandoned` appears as
  `pending` on each leaving edge and as a terminal host turn.
- Raises are dashed and part of their source transition.
- `flow explain Checkout ADDRESS.EDITING ADDRESS.street.Changed` shows `Field`'s handler and the
  guard `AddressStep` filled.

---

## 8. Benefits, drawbacks, and opus-split head to head

### 8.1 Benefits

1. **One lifecycle, everywhere.** Entering and leaving a node is one rule (rule 3) whether the
   node is a plain substate, a routine or the actor's root. Fragment activation stops being a
   second mechanism beside state entry.
2. **Leftover memory becomes structural for the whole machine.** In the editor, six hand resets
   (`error: ""` four times, `lockRetries: 0` twice) disappear because the fields live on their
   nodes. Opus-split gives this only inside fragments.
3. **Entry data for any node.** `S.X.from` passes the entering event's data into a node's memory
   for that node's lifetime, without parking it in root memory. This is new for plain states too.
4. **`start` removes duplicated first actions.** `commitDraft` appears on four transitions today;
   here SAVING is entered through one edge value and `SENDING.start` sends on every entry.
5. **Traits anywhere.** A debounce on `OPEN` lives exactly as long as editing does. The T2 trap in
   trait form is a construction error, and it surfaced a real T2 bug in the reference editor.
6. **Fewer special cases than opus-split.** No staged read for surviving scopes, no "traits only
   at a root", no "inputs forbidden on default paths", no separate `story.fragment`, no special
   filling shape (fillings are `on` handlers).
7. **The ports table is the mental model.** input/live/requests/guards/callbacks/exits for pieces
   mirror input/context/operations/guards/send/dispose for actors. An agent learns one shape.
8. **Better static pictures.** Memory ownership per node, `start` on nodes and input on edges are
   all structural data.
9. **Low ripple for ordinary machines.** The queue, session and toasts change one line each; the
   snapshot keeps `state` and root memory exactly.

### 8.2 Drawbacks

1. **Machines.plan core rewrite.** Node memory, scope, lifecycle and fusion rewrite O1–O3 and O8,
   not just add an outcome. Opus-split is additive.
2. **Type complexity.** Lexical memory views per node, absent-when-inactive fields, instance slices
   and nested `E` paths make the S1 type spike harder than opus-split's. This is the biggest risk.
3. **Every definition changes `states` from list to record.** Mechanical, but it touches every
   machine and every agent's prior knowledge of the API.
4. **Views must narrow node fields.** `s.memory.error` is `string | undefined` outside FAILED.
5. **Two scoping behaviours.** Inline nodes are transparent, named pieces are opaque. One rule
   (lexical scope) explains both, but a reader still has to know which a node is.
6. **Input lives on the edge (A2 trade).** A routine's input mapper is not in its instance block;
   a named edge value mitigates it.
7. **D6 is by convention for patches.** A `.from` mapper cannot see the same turn's update.
8. **Asymmetric construction.** Actors are two calls (`definition` + `machine`), pieces one.
9. **All of opus-split's request weight is kept**: kinds, two mapping halves, `notSent`,
   `abandoned` with `pending`, call and arming ids, terminal totality. None of it got cheaper.
10. **Persistence and hydration validate more**: node fields against the active path, activation
    ids, durable `abandoned` records.

### 8.3 Head to head with opus-split

| | opus-split | This proposal |
| --- | --- | --- |
| New keywords (entries / with sub-words) | 19 / ~22 | 20 / ~24 |
| Numbered rules | 11, for fragments, on top of today's O2 memory/scope rules | 12, for the whole machine; replace O2's memory clause |
| Atomic rules (approx., ±2) | ~29 | ~27 |
| `flow check` findings | 16 | 20 (adds input entry, start on admission, non-total filling, callback target, memory placement) |
| Existing machines | unchanged | `states` becomes a record |
| Fresh memory on entry | fragments only | any node |
| Traits | at a root only | on any node |
| Entry input | per placement, staged read of the entering transition | per edge `S.X.from`, typed by the event; defaults too |
| First action | `start` on subroutines | `start` on any node |
| Fillings | callbacks and exits without guards | `on` handlers that must be total |
| Testing alone | `story.fragment` (new) | `story.machine` (extended) |
| Request semantics | same | same |
| Machines plan change | additive (medium) | core rewrite (large) |

**What opus-split does better:** it is additive, so it carries no migration and a much smaller
type spike; D6 is fully prevented by its staged read; A2 is exact (one block holds input too); it
asks nothing of authors who never use fragments.

**What this does better:** one lifecycle instead of two; leftover memory prevented beyond
fragments; traits where they belong (T2 trait trap made structural); typed per-edge entry, which
the round-2 principles review preferred; `start` on any node, which removes repeated first
actions in ordinary machines; fewer special cases; one test entry point.

**Correctness** is equal on the fragment problems, because the request and abandonment semantics
are the same. This proposal is ahead on L3 and T2, behind on D6 (patch) and A2 (input placement).

---

## 9. Plan changes and migration

| Plan | Change | Size |
| --- | --- | --- |
| **Machines** | O1: `states` as a record of node contracts; node `input`/`memory`/`initial`/`traits`; `trait` and `routine` constructors and contracts; ports; name uniqueness per piece. O2: lexical scope replaces "substates share memory"; one node lifecycle (rule 3); event routing per piece; abandonment. New outcome for pieces (rules 6–8, 10–11). O3: fusion with whole-transition decline and terminal totality; "nodes entered this turn read fresh"; patch routing per owning node; `abandoned` as a turn source. O4: `check()` evaluates raise payload mappers. O5: arming ids; schedules on any node and in pieces; tie-break for traits; `live` in schedule callbacks. O6: activities only in the actor's piece; results owned by piece activations. O8: memory with absent node fields and instance slices; `.is` narrows memory. | **large** |
| **Operations** | Request bindings: required `success` and every failure tag; standard outcomes routed to the piece; `notSent` for `reject`, pre-invocation cancel and never-invoked restore on request-bound commits; Attempt on request-bound `interrupt` and `defect`; a throwing mapper delivers `defect`; the fencing exception to "its event reaches the actor's later state" for piece activations. | **medium** |
| **Runtime** | O4/O6: activation ids per piece activation; nothing else (send, context and disposal unchanged). | **small** |
| **Persistence** | O2: node fields validated against the restored state path; activation, call and arming ids; durable `abandoned` records; pending reads restore as `interrupt`. O4: restore never runs `start` or trait input. | **medium** |
| **ServerRendering** | O3: transfer node memory and ids; digest covers piece ids and contracts. O5: activation never runs `start`. | **small** |
| **React** | O2: pre-attach snapshot runs node `initial` and pure `default` `.from` mappers along the default path. O4: memory narrowing by tokens. | **small** |
| **Testing** | O1: `story.machine` accepts a trait or routine (harness actor), with `.enter`, `.leave`, `.cancel`; piece cuts expose `piece`, `exit`, `calls`, `requests`, `abandoned`. O3 and O5 unchanged. | **medium** |
| **Inspection** | O1: Model adds pieces, ports, fillings, node memory ownership, request and `abandoned` edges, `start` per node; `inspect(runtime)` adds activation, call and arming ids. O6: clusters. Patch keys read from types (check 18). | **medium** |
| **CommandLine** | O5: checks 2–20 of section 7. | **small** |
| **Diagnostics** | New codes: `InputRequired`, `StartOnAdmission`, `RequestOutstanding`, `NonTotalFilling`, `CallbackTargetOutsideNode`, `RaiseIntoChangingInstance`, `RaisedCommandUnhandled`. | **small** |
| **Package** | O1: export `trait`, `routine`; testing exports unchanged except new commands. | **small** |
| LazyFeatures, EntityDomains, FlowState | none (FlowState D1/D2 are honoured; the Machines plan is still `proposed`, so no shipped code migrates). | none |

**Migration of the reference app**

| Area | Change | Cost |
| --- | --- | --- |
| `Session`, `Toasts`, `Queue` definitions | `states` list → record (one line each) | trivial |
| Queue machine, component, Stories, tests, SSR Story | none | none |
| New `pieces/pieces.ts` | `Debounce`, `CommitWithRetry` (and their two piece Stories) | small |
| Editor definition and machine | rewritten as 4.7: six internal events move into the routine, `LOCKED` disappears, `error` and the lock counter become scoped memory | medium |
| `TicketPanel.tsx` | status map keys (`LOCKED` → `RECONCILING`), `SaveProgress` and `ErrorNotice` read the slice and node memory | small |
| Editor Stories and tests | `S.OPEN.LOCKED` → `S.OPEN.SAVING.BACKOFF`; `memory.lockRetries` → `memory.SAVING?.attempts`; `memory.error` read through FAILED; `editedWhileSaving` now agrees with Machines O5 | small |
| `editor.ref.ts`, `useEditor.ts`, app wiring, host, persistence, SSR | none | none |

About one focused working session for an agent, dominated by the editor and its tests.

---

## 10. Open questions

1. **Type spike first.** Lexical node-memory views and absent-when-inactive fields must infer
   without assertions in TypeScript 7 (FlowState C3). If they do not, fall back to root memory plus
   piece memory only, and keep the rest (traits anywhere, per-edge `.from`, `start` on any node,
   fillings as total handlers). That fallback is opus-split's surface with this file's lifecycle,
   and it keeps most of the benefit except benefit 2.
2. **Should node `input` without `initial` become memory directly?** It would remove three lines
   per scoped node (FAILED) at the cost of a second form. Not proposed.
3. **Patch-key conflicts in fused transitions** use the documented order (source, fillings,
   raised). Codex-split rejects overlaps at construction instead; either is sound.
4. **Host memory on an instance node.** A host can attach `on`, `schedules`, `activities` and
   traits to a routine's node, but not memory. Allowing it would add a fourth memory owner per
   node; not proposed.
