# Machine fragments: traits and subroutines (version 2)

**Status:** proposal, not accepted. It **supersedes [proposal.md](proposal.md)**. It is evaluated
against [principles.md](principles.md), plus the problems the review rounds added: E4, E5, H4, H5,
L5–L8, D5–D7, T1, T2 and A7, listed in section 7. Where this file and a plan differ, the plan wins;
section 11 lists every plan amendment the proposal needs.

**Sources:**

- **Surface:** [research/opus-split.md](research/opus-split.md): two constructors, three sender
  lists, one contract table.
- **Request semantics:** [research/codex-split.md](research/codex-split.md).
- **Traits on any node, fillings as total handlers, and `story.machine` harnesses:**
  [research/opus-trait-routine-actor.md](research/opus-trait-routine-actor.md).
- **`notify`:** codex-single.
- **The one-sentence callback rule:** opus-single.
- **Review findings:** [research/reviews/](research/reviews/), rounds 1–3.

---

## 1. The model in one page

**Fragments.** Machines repeat behaviour: a debounce, a validated field, a confirmation, a save
with retry, a poll. A **fragment** is such behaviour, written once and placed into a machine at
construction. The machine stays one actor with one mailbox, one turn and one plain snapshot.
Fragments come in two kinds, and the constructor names the kind:

| | **trait** — the actor _has_ it | **subroutine** — the actor _goes into_ it |
| --- | --- | --- |
| Examples | debounce, field, hold-to-confirm, toggle, cooldown | confirm, commit with retry, poll, wizard step |
| Placed | in `traits`, at the root or on a node: `Debounce(…).at("OPEN")` | as a state: `{ SAVING: SaveTitle }` |
| States of its own | none | yes; they appear under its state (`SAVING.BACKOFF`) |
| Lives | while its node is active (the root: the actor's life) | while its state is active; fresh on every entry |
| Ends | when its node is left | by taking an **exit**, or abandoned when the host leaves |
| Contains | traits | traits (not subroutines, in version 1) |

**The contract.** Each fragment declares a contract in plain Schema records. The host fills every
port in **one block per instance**, and every port must be filled (`{}` means "ignore"). Each port
answers one question:

| Port | Question | Fragment declares and uses | Host fills |
| --- | --- | --- | --- |
| `input` | what is fixed when it starts? | `input: { start: value }`, read by `initial` | `input: ({ memory, context, event }) => …` |
| `events` | sent by anyone | public, at the instance path (`E.ADDRESS.street.Changed`) | nothing |
| `hostEvents` | sent only by my host | handled in `on` | `raise: [E.title.Set.from(…)]` |
| `internalEvents` | sent only by me | from the fragment's own schedules and request results | nothing |
| `guards` | where may the host say no? | `guards: ["canEdit"]`, `guard: guards.canEdit` | `guards: { canEdit: (i) => … \|\| deny("Locked") }` |
| `callbacks` | what should the host hear? | `callbacks: { onChanged: { value } }`, `notify: [callbacks.onChanged.from(f)]` | a total `on`-style handler |
| `requests` | what I/O does it need, and what comes back? | kind, input, one success result and named failure results | `operation` (which operation) and, for commits, `abandoned` |
| `exits` (subroutines) | how can it finish? | `exits: { Done: { address } }`, `target: exits.Done.from(f)` | a total `on`-style handler per exit |

**One turn.** Fillings and raises are **fused at construction** into ordinary transitions. All
guards read the pre-turn snapshot. If any fused part declines, the whole transition declines, and
`check()` agrees. A request result, an exit or a timer firing can never be lost because something it
raises refuses.

**I/O.** A fragment names its requests; the host says which operation runs each one. The host maps
the operation's success and failure tags onto the request's declared results. The fragment maps
those results, plus the standard outcomes:

- `notSent`: guaranteed never invoked;
- `unknown`, `interrupt`, `defect`: maybe invoked; they carry the Attempt.

A commit that outlives its step reaches the host's `abandoned` handler twice: with `pending` in the
very turn the step is left, and again when it settles.

**Lifetimes.** Each activation of a node or a step owns its memory, timers and calls. Leaving
removes the memory and stops the timers. A late result never reaches a newer activation: a read is
dropped, and a commit goes to `abandoned`.

---

## 2. Rules

1. **Kinds and placement.**
   - The constructors are `trait(contract, body)` and `subroutine(contract, body)`.
   - A trait goes in a definition's or fragment's `traits`: bare for the root, or `.at("PATH")` for a
     node of that definition or fragment.
   - A subroutine goes in a machine definition's `states` as `{ NAME: Sub }`. A subroutine contains
     traits; it does not contain subroutines (version 1). The types refuse other placements.
   - The host fills a trait instance in its body's root `traits` block, wherever the trait is
     placed. It fills a subroutine on that subroutine's state.
   - Instance names are unique per actor and differ from host memory keys.
   - A fragment that declares `requests` must be placed directly by a machine.

2. **Lifecycle follows the node.**
   - A trait is active while its node is active; at the root, that is the actor's life. A
     subroutine's instance is active from each entry of its state to leaving it.
   - **On activation:** read `input`, run `initial`, activate child traits (parents first), arm
     schedules.
   - **On leaving:** remove the memory, stop schedules, and stop delivering results (rule 12).
   - Explicitly re-entering a node (Machines O2) re-activates its traits and its subroutine.
   - A schedule's `restartOn` baseline is taken from the **entering turn's committed memory**.

3. **Entry input.**
   - `input` is filled once per placement. It reads the **staged** snapshot (memory after the
     entering transition's updates) plus the entering `event`. An exit's payload counts as the
     event.
   - A root trait activates at admission. Its `input` reads the host's initial memory and context,
     and has no `event`.
   - No subroutine sits on the admission path (the actor root's default chain).

4. **`start`.** A subroutine may declare `start: [...]`: actions appended to every transition that
   enters it, reading the fragment's fresh memory. They never run on restore. Plain states keep
   "no entry actions".

5. **Senders.**
   - `events`: anyone may send them, at the instance's full path. Only declared guards can refuse
     them.
   - `hostEvents`: only the direct parent raises them.
   - `internalEvents`: only the fragment's own schedules and request results produce them.
   - Host and fragment handle disjoint event sets.

6. **Guards.** A fragment puts `guard: guards.x` (alone, or in an array that must all pass) on the
   transitions it allows to be refused. The host fills `x` with a guard over its pre-turn inputs
   plus the fragment's `event`. Inside fragment code, `state` is the fragment's own leaf-path union.

7. **Callbacks.**
   - A fragment calls callbacks in `notify: [...]` on its transitions, never in `actions`.
   - The host fills each callback with an `on`-style handler (`target?`, `updateMemory?`,
     `actions?`, `raise?`). It may be ordered alternatives, and must end in an unguarded one.
   - **A callback never leaves its placement node; an exit must.** So a root trait's callback may
     move the host anywhere, and a subroutine's callbacks never move it.

8. **Exits.** A subroutine returns only by taking an exit. The host fills every exit with a total
   `on`-style handler; its guards choose among host reactions and never refuse the exit. Any host
   transition handled at or above the subroutine's state **abandons** it, and no exit is taken.

9. **Requests.**
   - **Shape.** A request declares `kind` (`"commit"` or `"read"`), its `input` Schema, one
     `success` result and named `failure` results.
   - **Fragment side.** The fragment computes the input in one place, from its own memory. It maps
     each result with `.from`. It maps the standard outcomes **bare**, onto events of fixed shape:
     - commits: `notSent` → `{}`; `unknown`, `interrupt` and `defect` → `{ attempt: Attempt }`;
     - reads: `interrupt` and `defect` → `{}`.

     A commit's `defect` is therefore uncertainty, never a retryable or rejected result.
   - **Host side.** The host's `operation` receives result tokens as its only argument. Its select
     reads only `payload`. It maps `success` onto the success token and every failure tag onto
     failure tokens.
   - **Concurrency.** A commit request's operation uses `reject`, `cancel` or `serialize`, never
     `allow`.
   - **Calls that never run.** For commits, `reject`, a cancel before invocation and a restore
     that was never invoked answer `notSent`. For reads, the same cases answer `interrupt`.
   - **Throwing mappers.** If any result mapper throws (the host's or the fragment's), an issue is
     recorded and the fixed `defect` reply is delivered with no mapper.
   - **Outstanding calls.** At most one call per request is outstanding per activation; a second
     one rejects the turn before publication.

10. **Abandoned commits.**
    - Each commit binding has exactly one `abandoned` handler, written next to its `operation`. It
      is total and `on`-shaped, with no `target`, `raise` or `notify`, and it writes host memory
      only.
    - Its payload is `{ outcome, attempt }`. `outcome` is `"pending"`, `"success"`, `"failure"`,
      `"notSent"`, `"unknown"`, `"interrupt"` or `"defect"`.
    - If a call is outstanding when its activation ends, `abandoned` runs with `"pending"` **fused
      into the leaving transition**. It runs again with the terminal outcome as a later host turn.
    - The record is durable across restore.
    - A host memory key written by both the pending run and the leaving transition is a
      construction error.

11. **One turn.**
    - A transition, the callbacks it notifies, the exits it takes and the raises it makes compile
      into **one** transition.
    - `raise` targets a direct child's `hostEvents`, in a child active before and after the
      transition.
    - The raise and notify graph is acyclic.
    - At most one fused part has a non-`"self"` target.
    - Fused parts write disjoint memory keys; overlap is a construction error.
    - All guards run on the pre-turn snapshot; `check()` evaluates raise payload mappers to supply
      child guards. If any guard declines, or a raised event is unhandled, the whole transition
      declines.
    - Updates apply in order (source, fillings, raised handlers), then action parameters, then
      `start`. One batch validates; one publication.

12. **Identity and delivery.**
    - Each call carries a call id, and each timer firing an arming id.
    - A current result or firing is delivered to the fragment as an ordinary internal event.
    - A stale one goes elsewhere: a read result or firing is dropped with evidence, and a commit
      result goes to `abandoned`.
    - Restore keeps both ids. An acknowledged in-flight commit restores as `unknown`; a
      never-invoked one as `notSent`; a pending read as `interrupt`.

13. **Terminal totality.** A raise or notify reachable from a request-result handler, an exit
    filling or a timer-fired handler must reach a handler that cannot decline:
    - every raised `hostEvent` is handled unguarded at the child's root or in every leaf;
    - every callback filling ends in an unguarded alternative.

    A defect in pure code (a throwing guard, update or select) is still a bug. It publishes an
    issue under Machines O3 and leaves the step in place, and the host can always leave (rule 8).

14. **Reading and limits.**
    - Anyone may read fragment memory and states. An inactive slice is `undefined`. Only the
      fragment writes its memory.
    - Fragments declare no `operations`, `context`, `onContext`, `send`, `activities` or persistence.
    - The machine's `E` also holds tokens for direct children's `hostEvents`, for `raise`. The
      definition's `E` does not.

---

## 3. Keywords

| Class | Words |
| --- | --- |
| **New (19)** | `trait`, `subroutine`, `traits`, `.at`, `hostEvents`, `guards` (declaration and filling block; per-transition `guard` is unchanged), `callbacks`, `notify`, `requests`, `kind` (`"commit"` / `"read"`), `operation`, `results`, `notSent`, `abandoned` (payload `outcome`, `attempt`, `"pending"`), `exits`, `start`, `raise`, `payload` (data a fragment hands across: callback, exit, request) |
| **New in testing (3)** | Story `.enter(input?)`, `.leave()`, `.cancel(request)`; cuts expose `piece`, `calls`, `requests`, `exit`, `abandoned` |
| **Existing, extended** | `input` / `initial` (also seed fragments), `events` (public at every level), `story.machine` (also accepts a fragment, wrapped in a harness actor), `E` (nested instance paths), `outcomes` (the fragment's request map) |
| **Existing, unchanged** | `definition`, `machine`, `id`, `states`, `internalEvents`, `memory`, `context`, `operations`, `default`, `on`, `target`, `"self"`, `guard`, `deny`, `check`, `updateMemory`, `actions`, `schedules`, `schedule`, `restartOn`, `send`, `activities`, `onContext`, `success`, `failure`, `unknown`, `interrupt`, `defect`, `.from`, `.is`, `.child`, `commit`, `retry`, `cancel`, `lookup`, `refetch`, `subscribe`, `Attempt`, `S`, `E`, `O`, `useView`, `story`, `.send`, `.process`, `.advance`, `.advanceToNextTimer`, `.checkpoint`, `.run`, `fixtures` |
| **Author-chosen** | fragment names (`Debounce`, `Field`, `HoldToConfirm`, `Confirm`, `CommitWithRetry`, `Poll`, `AddressStep`, `SaveTitle`), instance names (`settle`, `email`, `hold`, `ASK`, `DELETING`, `LIVE`, `ADDRESS`, `PLACING`, `SAVING`, `autosave`), port names (`onSettled`, `onChanged`, `onHeld`, `canEdit`, `canPress`, `send`, `refresh`, `verify`, `SetSlow`), result and exit names (`Done`, `Busy`, `Rejected`, `GaveUp`, `Uncertain`, `Confirmed`, `Declined`, `Valid`, `Invalid`, `Ok`, `Failed`, `Back`) |

**Counts:**

- **Keywords:** 19 new authoring words plus 3 Story commands, 22 in all. Counting `abandoned`'s
  payload words separately (`outcome`, `attempt`, `"pending"`), about 25.
- **Rules:** 14 numbered rules, about 50 atomic clauses.
- **Checks:** 18 `flow check` checks.

---

## 4. Full examples

`TicketsDomain`, `AuthDomain`, `OrdersDomain`, `AddressesDomain` and `MaintenanceDomain` are
operation handles declared elsewhere. So are the fixture Layers (`TicketsFixture`, `OrdersFixture`,
`AuthFixture`, `MaintenanceFixture`). Each fixture's options choose its responses.

### 4.1 The fragments

```ts
// fragments.ts — reusable traits and subroutines. None of them does I/O, reads context or sends.
import { deny, subroutine, trait, Attempt } from "flow-state";
import { Duration, Schema } from "effect";

// ── Debounce (trait): tells its host once, `wait` after the last Input ──────────────────
// Its restartOn baseline is taken when it activates with its node (rule 2), and only Input
// changes seq, so the first Input after activation always arms the timer (T2).
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
        Due: { target: "self", notify: [callbacks.onSettled] },
      },
    }),
  );

// ── Field (trait): a validated value; the user edits it, the host may set it ────────────
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      input: { start: value },
      events: { Changed: { value }, Blurred: {} },     // anyone; only canEdit can refuse Changed
      hostEvents: { Set: { value } },                  // the host sets it, e.g. from a server value
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
          notify: [callbacks.onChanged.from(({ event }) => ({ value: event.value }))],
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

// ── HoldToConfirm (trait): tells its host after a continuous hold ───────────────────────
// Release is public and unguarded: no host can refuse or drop it (E1, E4). The arming id
// means a firing queued before a re-press cannot confirm early.
export const HoldToConfirm = (p: { hold: Duration.Input }) =>
  trait(
    {
      id: "HoldToConfirm",
      events: { Press: {}, Release: {} },
      internalEvents: { Held: {} },
      memory: { pressing: Schema.Boolean, presses: Schema.Int },
      initial: () => ({ pressing: false, presses: 0 }),
      guards: ["canPress"],                            // only Press may be refused
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
            notify: [callbacks.onHeld],
          },
          { target: "self" },                          // the firing is always consumed
        ],
      },
    }),
  );

// ── Confirm (subroutine): one state, two exits ──────────────────────────────────────────
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

// ── CommitWithRetry (subroutine): sends the request captured at entry; retries only on
//    Busy or notSent, never on unknown, interrupt or defect (H5) ────────────────────────
export const CommitWithRetry = <Req extends Schema.Struct.Fields, Res extends Schema.Struct.Fields>(
  shape: { request: Req; result: Res },
  p: { maxRetries: number; backoff: Duration.Input },
) =>
  subroutine(
    {
      id: "CommitWithRetry",
      input: { request: Schema.Struct(shape.request) },
      states: ["SENDING", "BACKOFF"],
      internalEvents: {
        Sent: shape.result,
        Busy: { reason: Schema.String },
        Refused: { reason: Schema.String },
        NotSent: {},                                   // fixed shape for notSent
        Unsure: { attempt: Attempt },                  // fixed shape for unknown, interrupt, defect
        Retry: {},
      },
      memory: {
        request: Schema.Struct(shape.request),         // frozen for every retry (D2)
        attempts: Schema.Int,
        lastBusy: Schema.NullOr(Schema.String),
      },
      initial: ({ input }) => ({ request: input.request, attempts: 0, lastBusy: null }),
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
      start: [requests.send],                          // the first send rides the entering transition (A7)
      requests: {
        send: {
          input: ({ memory }) => memory.request,
          outcomes: {
            Done: E.Sent.from((result) => result),
            Busy: E.Busy.from(({ reason }) => ({ reason })),
            Rejected: E.Refused.from(({ reason }) => ({ reason })),
            notSent: E.NotSent,                        // bare: guaranteed never invoked
            unknown: E.Unsure,                         // bare: carries the attempt
            interrupt: E.Unsure,
            defect: E.Unsure,                          // a commit defect is uncertainty
          },
        },
      },
      states: {
        SENDING: {
          on: {
            Sent: exits.Done.from(({ event }) => event),
            Refused: exits.Rejected.from(({ event }) => ({ reason: event.reason })),
            Unsure: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })),
            Busy: [
              {
                target: S.BACKOFF,
                guard: ({ memory }) => memory.attempts < p.maxRetries || deny("NoRetriesLeft"),
                updateMemory: ({ memory, event }) => ({ attempts: memory.attempts + 1, lastBusy: event.reason }),
              },
              exits.GaveUp.from(({ memory, event }) => ({ reason: event.reason, attempts: memory.attempts })),
            ],
            NotSent: [                                 // never invoked, so backing off is safe
              {
                target: S.BACKOFF,
                guard: ({ memory }) => memory.attempts < p.maxRetries || deny("NoRetriesLeft"),
                updateMemory: ({ memory }) => ({
                  attempts: memory.attempts + 1,
                  lastBusy: "An earlier request is still running",
                }),
              },
              exits.GaveUp.from(({ memory }) => ({
                reason: "An earlier request is still running",
                attempts: memory.attempts,
              })),
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

// ── Poll (subroutine): refreshes a keyed read until its host leaves ─────────────────────
// No exits: like a machine, it ends only when its host leaves (L4). The host pushes the
// page's visibility as a hostEvent; there are no live values.
export const Poll = <K extends Schema.Struct.Fields>(
  key: K,
  p: { every: Duration.Input; slowEvery: Duration.Input; maxBackoff: Duration.Input },
) =>
  subroutine(
    {
      id: "Poll",
      input: { key: Schema.Struct(key), slow: Schema.Boolean },
      states: ["WAITING", "REFRESHING"],
      hostEvents: { SetSlow: { slow: Schema.Boolean } },
      internalEvents: { Tick: {}, Ok: {}, Failed: {} },
      memory: { key: Schema.Struct(key), slow: Schema.Boolean, failures: Schema.Int },
      initial: ({ input }) => ({ key: input.key, slow: input.slow, failures: 0 }),
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
      on: {
        // total at the root; WAITING overrides it to re-arm its tick at the new pace
        SetSlow: { target: "self", updateMemory: ({ event }) => ({ slow: event.slow }) },
      },
      states: {
        WAITING: {
          schedules: {
            tick: {
              schedule: ({ memory }) =>
                Duration.min(
                  Duration.times(memory.slow ? p.slowEvery : p.every, 2 ** memory.failures),
                  p.maxBackoff,
                ),
              send: E.Tick,
            },
          },
          on: {
            Tick: { target: S.REFRESHING, actions: [requests.refresh] },
            SetSlow: { target: S.WAITING, updateMemory: ({ event }) => ({ slow: event.slow }) },
          },
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

### 4.2 Debounce: a search box

New: `traits`, `hostEvents`, `callbacks`, `notify`, `raise`. A single debounce could stay a host
schedule with `restartOn` (Machines O5). It becomes a trait once a second machine needs it.

```ts
// ticket-search.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Debounce } from "./fragments";

export const TicketSearch = definition({
  id: "Desk/TicketSearch",
  states: ["READY"],
  traits: { settle: Debounce({ wait: "300 millis" }) },   // root: lives with the actor
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
      raise: [E.settle.Input],                    // fused: one transition, one publication
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
import { useView } from "flow-state/react";
import { TicketSearch } from "./ticket-search.definition";
import type { TicketSearchMachine } from "./ticket-search.machine";

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
// debounce.test.ts — the trait alone, in a harness actor
import { story } from "flow-state/testing";
import { Debounce } from "./fragments";

const Quiet = Debounce({ wait: "300 millis" });

export const quiet = story
  .machine(Quiet, { id: "Debounce/quiet" })        // the harness raises hostEvents as public events
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

New: `traits` with `input`, `guards` and `callbacks` fillings. The root traits' `input` is read at
admission, from the host's initial memory (rule 3).

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
        defect: E.Rejected.from(() => ({ reason: "Something went wrong; try signing in before retrying" })),
      },
    },
  );

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

`createUser` is the host's own commit, not a fragment request, so Machines O6's rules apply as
today.

```tsx
// SignupForm.tsx
import { check } from "flow-state";
import { useView } from "flow-state/react";
import { visibleError } from "./fragments";
import { Signup } from "./signup.definition";
import type { SignupMachine } from "./signup.machine";

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
      {/* the password input is the same, with Signup.E.password.* */}
      {/* signup.send(Signup.E.email.Set({ value: "x" }))  ← type error: a hostEvent */}
      <button disabled={!canSubmit}>Create account</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

```ts
// field.test.ts
import { deny, check } from "flow-state";
import { story } from "flow-state/testing";
import { Schema } from "effect";
import { Field } from "./fragments";

const Title = Field(Schema.String, { validate: (v) => (v ? null : "Required") });

export const locked = story
  .machine(Title, { id: "Field/locked", input: { start: "a" }, guards: { canEdit: () => deny("Locked") } })
  .send(Title.E.Changed({ value: "b" }))
  .process()
  .checkpoint("after");

test("a denied edit changes nothing and notifies nothing", async () => {
  const run = await locked.run();
  expect(run.checkpoints.after.piece?.value).toBe("a");
  expect(check(run.checkpoints.after.snapshot, Title.E.Changed({ value: "c" }))).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "Locked" }],
  });
  expect(run.checkpoints.after.calls.onChanged).toEqual([]);
});
```

### 4.4 Hold-to-confirm: a trait callback that moves the host

`onHeld` targets `S.WIPING`. That is allowed because a root trait's placement node is the host's
root (rule 7).

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
      defect: E.WipeFailed.from(() => ({ reason: "The wipe may have happened; reload to check" })),
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
import { useView } from "flow-state/react";
import { DangerZone } from "./danger-zone.definition";
import type { DangerZoneMachine } from "./danger-zone.machine";

export function WipeButton({ zone }: { zone: Actor<typeof DangerZoneMachine> }) {
  const pressing = useView(zone, (s) => s.memory.hold.pressing);
  const wiping = useView(zone, (s) => DangerZone.S.WIPING.is(s));
  const error = useView(zone, (s) => s.memory.error);
  return (
    <>
      <button
        disabled={wiping}
        onPointerDown={() => zone.send(DangerZone.E.hold.Press())}
        onPointerUp={() => zone.send(DangerZone.E.hold.Release())}       // never refusable
        onPointerLeave={() => zone.send(DangerZone.E.hold.Release())}
      >
        {pressing ? "Keep holding…" : "Hold to wipe"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
```

```ts
// hold.test.ts
import { story } from "flow-state/testing";
import { HoldToConfirm } from "./fragments";

const Hold = HoldToConfirm({ hold: "2 seconds" });

export const letGoEarly = story
  .machine(Hold, { id: "HoldToConfirm/early", guards: { canPress: () => true } })
  .send(Hold.E.Press()).process()
  .advance("1 second").process()
  .send(Hold.E.Release()).process()
  .send(Hold.E.Press()).process()             // re-press: a new arming
  .advance("1 second").process().checkpoint("one-second-into-second-hold")
  .advance("1 second").process().checkpoint("held");

test("an early release never confirms; a full hold confirms once", async () => {
  const run = await letGoEarly.run();
  expect(run.checkpoints["one-second-into-second-hold"].calls.onHeld).toHaveLength(0);
  expect(run.checkpoints.held.calls.onHeld).toHaveLength(1);
});
```

### 4.5 Confirm and commit-with-retry: deleting a ticket

New: `exits`, `requests`, `operation`, `results`, `payload`, `abandoned`, `start`.

```ts
// ticket-delete.definition.ts
import { definition, Attempt } from "flow-state";
import { Schema } from "effect";
import { CommitWithRetry, Confirm } from "./fragments";

export const DeleteTicket = CommitWithRetry(
  { request: { ticketId: Schema.String }, result: {} },
  { maxRetries: 3, backoff: "1 second" },
);

export const TicketDelete = definition({
  id: "Desk/TicketDelete",
  states: ["VIEWING", { ASK: Confirm }, { DELETING: DeleteTicket }, "DELETED", "UNSURE"],
  events: { Delete: {}, Dismiss: {} },
  input: { ticketId: Schema.String },
  memory: {
    ticketId: Schema.String,
    error: Schema.NullOr(Schema.String),
    unresolved: Schema.NullOr(Attempt),
  },
  initial: ({ input }) => ({ ticketId: input.ticketId, error: null, unresolved: null }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-delete.machine.ts
import { machine, deny } from "flow-state";
import { TicketDelete } from "./ticket-delete.definition";

export const TicketDeleteMachine = machine(TicketDelete, ({ S, O }) => ({
  default: S.VIEWING,
  states: {
    VIEWING: {
      on: {
        Delete: {
          target: S.ASK,
          guard: ({ memory }) => memory.unresolved === null || deny("PreviousDeleteUnresolved"),
          updateMemory: () => ({ error: null }),
        },
      },
    },
    ASK: {
      exits: { Confirmed: S.DELETING, Declined: S.VIEWING },
    },
    DELETING: {
      input: ({ memory }) => ({ request: { ticketId: memory.ticketId } }),
      requests: {
        send: {
          // tickets.delete is declared with concurrency "reject" (never "allow", rule 9)
          operation: ({ results }) =>
            O.Tickets.delete.commit(({ payload }) => ({ ticketId: payload.ticketId }), {
              outcomes: {
                success: results.Done,
                failure: {
                  TicketLocked: results.Busy.from(({ lockedBy }) => ({ reason: `Locked by ${lockedBy}` })),
                  TicketMissing: results.Rejected.from(() => ({ reason: "Already deleted" })),
                },
              },
            }),
          abandoned: {
            // DELETING has no leaving path today, but every commit binding carries its record
            updateMemory: ({ payload }) =>
              payload.outcome === "success" || payload.outcome === "failure" || payload.outcome === "notSent"
                ? { unresolved: null }
                : { unresolved: payload.attempt },
          },
        },
      },
      exits: {
        Done: S.DELETED,
        GaveUp: { target: S.VIEWING, updateMemory: ({ payload }) => ({ error: `${payload.reason}. Try later.` }) },
        Rejected: { target: S.VIEWING, updateMemory: ({ payload }) => ({ error: payload.reason }) },
        Uncertain: { target: S.UNSURE, updateMemory: ({ payload }) => ({ unresolved: payload.attempt }) },
      },
    },
    DELETED: {},
    UNSURE: { on: { Dismiss: S.VIEWING } },
  },
}));
```

```tsx
// DeleteTicketButton.tsx
import { useView } from "flow-state/react";
import { TicketDelete } from "./ticket-delete.definition";
import type { TicketDeleteMachine } from "./ticket-delete.machine";

export function DeleteTicketButton({ del }: { del: Actor<typeof TicketDeleteMachine> }) {
  const asking = useView(del, (s) => TicketDelete.S.ASK.is(s));
  const waiting = useView(del, (s) => TicketDelete.S.DELETING.BACKOFF.is(s));
  const lock = useView(del, (s) => s.memory.DELETING?.lastBusy ?? null);
  const unsure = useView(del, (s) => TicketDelete.S.UNSURE.is(s));
  const error = useView(del, (s) => s.memory.error);
  if (asking)
    return (
      <dialog open>
        <button onClick={() => del.send(TicketDelete.E.ASK.Yes())}>Delete</button>
        <button onClick={() => del.send(TicketDelete.E.ASK.No())}>Keep</button>
      </dialog>
    );
  return (
    <>
      <button onClick={() => del.send(TicketDelete.E.Delete())}>Delete ticket</button>
      {waiting && <p role="status">{lock}. Retrying…</p>}
      {unsure && <p role="status">The delete may have happened. <button onClick={() => del.send(TicketDelete.E.Dismiss())}>OK</button></p>}
      {error && <p role="alert">{error}</p>}
      {/* del.send(TicketDelete.E.DELETING.Sent({}))  ← type error: internal */}
    </>
  );
}
```

```ts
// confirm-and-commit.test.ts — each subroutine alone
import { story } from "flow-state/testing";
import { Effect } from "effect";
import { Confirm } from "./fragments";
import { DeleteTicket } from "./ticket-delete.definition";

export const confirmed = story
  .machine(Confirm, { id: "Confirm/yes" })
  .enter()                                        // the harness enters the subroutine's state
  .send(Confirm.E.Yes())
  .process()
  .checkpoint("after");

export const givesUp = story
  .machine(DeleteTicket, {
    id: "CommitWithRetry/gives-up",
    requests: { send: () => Effect.fail({ _tag: "Busy" as const, reason: "Locked" }) },
  })
  .enter({ request: { ticketId: "T-1" } })        // start: first send
  .process()
  .advanceToNextTimer().process()
  .advanceToNextTimer().process()
  .advanceToNextTimer().process()
  .checkpoint("end");

export const unknownStops = story
  .machine(DeleteTicket, {
    id: "CommitWithRetry/unknown-stops",
    requests: { send: () => Effect.never },       // invoked and held
  })
  .enter({ request: { ticketId: "T-1" } })
  .process()
  .cancel("send")                                 // post-invocation cancel: unknown (Operations O3)
  .process()
  .checkpoint("end");

test("Confirm returns Confirmed", async () => {
  const run = await confirmed.run();
  expect(run.checkpoints.after.exit).toEqual({ exit: "Confirmed", payload: {} });
});

test("retries the captured request, then gives up", async () => {
  const run = await givesUp.run();
  expect(run.checkpoints.end.requests).toEqual(
    Array.from({ length: 4 }, () => ({ request: "send", input: { ticketId: "T-1" } })),
  );
  expect(run.checkpoints.end.exit).toEqual({ exit: "GaveUp", payload: { reason: "Locked", attempts: 3 } });
});

test("unknown is never retried", async () => {
  const run = await unknownStops.run();
  expect(run.checkpoints.end.requests).toHaveLength(1);
  expect(run.checkpoints.end.exit?.exit).toBe("Uncertain");
});
```

### 4.6 A poll that runs until the host leaves

The hidden-tab slowdown is pushed into `Poll` as a `hostEvent`. Live values were cut, so this is
the one way a changing value reaches a fragment.

```ts
// queue.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Poll } from "./fragments";

export const Queue = definition({
  id: "Desk/Queue",
  states: [
    "PAUSED",                                          // admission path: no subroutine here (rule 3)
    { LIVE: Poll({ workspaceId: Schema.String }, { every: "5 seconds", slowEvery: "1 minute", maxBackoff: "5 minutes" }) },
  ],
  events: { Resume: {}, Pause: {}, PageHidden: {}, PageShown: {} },
  input: { workspaceId: Schema.String },
  memory: { workspaceId: Schema.String, hidden: Schema.Boolean },
  initial: ({ input }) => ({ workspaceId: input.workspaceId, hidden: false }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// queue.machine.ts
import { machine } from "flow-state";
import { Queue } from "./queue.definition";

export const QueueMachine = machine(Queue, ({ S, E, O }) => ({
  default: S.PAUSED,
  activities: {
    list: O.Tickets.list.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId })),
  },
  on: {
    PageHidden: { target: "self", updateMemory: () => ({ hidden: true }) },
    PageShown: { target: "self", updateMemory: () => ({ hidden: false }) },
  },
  states: {
    PAUSED: { on: { Resume: S.LIVE } },
    LIVE: {
      input: ({ memory }) => ({ key: { workspaceId: memory.workspaceId }, slow: memory.hidden }),
      requests: {
        refresh: {
          operation: ({ results }) =>
            O.Tickets.list.refetch(({ payload }) => payload, {
              outcomes: { success: results.Ok, failure: results.Failed },
            }),
        },
      },
      on: {
        // nearest handler wins: inside LIVE, visibility also reaches the poll, in the same turn
        PageHidden: { target: "self", updateMemory: () => ({ hidden: true }), raise: [E.LIVE.SetSlow.from(() => ({ slow: true }))] },
        PageShown: { target: "self", updateMemory: () => ({ hidden: false }), raise: [E.LIVE.SetSlow.from(() => ({ slow: false }))] },
        Pause: S.PAUSED,                               // abandons Poll; a late refresh is dropped
      },
    },
  },
}));
```

```tsx
// QueueHeader.tsx
import { useEffect } from "react";
import { useView } from "flow-state/react";
import { Queue } from "./queue.definition";
import type { QueueMachine } from "./queue.machine";

export function QueueHeader({ queue }: { queue: Actor<typeof QueueMachine> }) {
  const live = useView(queue, (s) => Queue.S.LIVE.is(s));
  const refreshing = useView(queue, (s) => Queue.S.LIVE.REFRESHING.is(s));
  const failures = useView(queue, (s) => s.memory.LIVE?.failures ?? 0);
  useEffect(() => {
    queue.send(Queue.E.Resume());                      // the queue polls while its panel is mounted
    const onVisibility = () => queue.send(document.hidden ? Queue.E.PageHidden() : Queue.E.PageShown());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      queue.send(Queue.E.Pause());
    };
  }, [queue]);
  return live ? (
    <span role="status">
      {refreshing ? "Refreshing…" : failures > 0 ? `Retrying (failed ${failures}×)` : "Live"}
    </span>
  ) : null;
}
```

```ts
// poll.test.ts
import { story } from "flow-state/testing";
import { Effect, Schema } from "effect";
import { Poll } from "./fragments";

const Every = Poll({ workspaceId: Schema.String }, { every: "5 seconds", slowEvery: "1 minute", maxBackoff: "5 minutes" });

export const slowsWhenHidden = story
  .machine(Every, { id: "Poll/slow", requests: { refresh: () => Effect.succeed({}) } })
  .enter({ key: { workspaceId: "W" }, slow: false })
  .advance("5 seconds").process().checkpoint("first")
  .send(Every.E.SetSlow({ slow: true })).process()     // the harness raises hostEvents
  .advance("5 seconds").process().checkpoint("not-yet")
  .advance("55 seconds").process().checkpoint("second")
  .leave().process().checkpoint("left");

test("polls, slows down when told, and stops when left", async () => {
  const run = await slowsWhenHidden.run();
  expect(run.checkpoints.first.requests).toHaveLength(1);
  expect(run.checkpoints["not-yet"].requests).toHaveLength(1);
  expect(run.checkpoints.second.requests).toHaveLength(2);
  expect(run.checkpoints.left.piece).toBeUndefined();
});
```

### 4.7 Two levels: checkout wizard → address step → two fields

`AddressStep` is a subroutine containing two `Field` traits and a `verify` read. The wizard binds
`verify` and the `place` commit.

- A `Cancel` during PLACING records `pending` in the same turn.
- `Start` refuses a new order until the old one is known (L7).
- `Reconcile` resolves it either way.

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
    internalEvents: {
      Verified: { address: Address },
      Problem: { reason: Schema.String },
      Unverified: {},                               // fixed shape for interrupt and defect
    },
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
      // child trait input reads the subroutine's fresh memory and its own input
      street: {
        input: ({ input }) => ({ start: input.address.street }),
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
          interrupt: E.Unverified,                  // bare, fixed shape {}
          defect: E.Unverified,
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
          Unverified: {
            target: S.EDITING,
            updateMemory: () => ({ problem: "Could not verify the address. Try again." }),
          },
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

export const PlaceOrder = CommitWithRetry(
  { request: { cartId: Schema.String, address: Address }, result: { orderId: Schema.String } },
  { maxRetries: 2, backoff: "2 seconds" },
);

export const Checkout = definition({
  id: "Shop/Checkout",
  states: ["CART", { ADDRESS: AddressStep }, { REVIEW: Confirm }, { PLACING: PlaceOrder }, "RECONCILING", "PLACED", "UNSURE"],
  events: { Start: {}, Cancel: {}, Reconcile: {} },
  internalEvents: { Reconciled: { orderId: Schema.String }, NotPlaced: { reason: Schema.String }, StillUnclear: {} },
  input: { cartId: Schema.String },
  memory: {
    cartId: Schema.String,
    address: Address,
    orderId: Schema.NullOr(Schema.String),
    error: Schema.NullOr(Schema.String),
    // an order the actor no longer waits for, and what is known about it
    late: Schema.NullOr(Schema.Struct({ attempt: Attempt, status: Schema.Literal("Pending", "Placed", "Unclear") })),
  },
  initial: ({ input }) => ({
    cartId: input.cartId,
    address: { street: "", city: "" },
    orderId: null,
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
  // Re-issues the uncertain attempt itself (same id, same input). Guards below ensure `late` is set.
  const reconcile = O.Orders.place.retry(({ memory }) => memory.late!.attempt, {
    outcomes: {
      success: E.Reconciled.from((order) => ({ orderId: order.orderId })),
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
        // read after the Confirmed exit's updates; every retry sends exactly this (D2, D6)
        input: ({ memory }) => ({ request: { cartId: memory.cartId, address: memory.address } }),
        requests: {
          send: {
            // orders.place is declared with concurrency "reject"
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
            // L5/L7: Cancel while placing; the order may still go through. Writes only `late`,
            // which Cancel does not write (rule 10).
            abandoned: {
              updateMemory: ({ payload }) => {
                switch (payload.outcome) {
                  case "pending":
                    return { late: { attempt: payload.attempt, status: "Pending" } };
                  case "success":
                    return { late: { attempt: payload.attempt, status: "Placed" } };
                  case "failure":
                  case "notSent":
                    return { late: null };
                  default:                                 // unknown, interrupt, defect
                    return { late: { attempt: payload.attempt, status: "Unclear" } };
                }
              },
            },
          },
        },
        exits: {
          Done: { target: S.PLACED, updateMemory: ({ payload }) => ({ orderId: payload.orderId }) },
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
        on: {
          Reconciled: { target: S.PLACED, updateMemory: ({ event }) => ({ late: null, orderId: event.orderId }) },
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
// AddressForm.tsx and CartActions.tsx
import { check } from "flow-state";
import { useView } from "flow-state/react";
import { visibleError } from "./fragments";
import { Checkout } from "./checkout.definition";
import type { CheckoutMachine } from "./checkout.machine";

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

export function CartActions({ checkout }: { checkout: Actor<typeof CheckoutMachine> }) {
  const late = useView(checkout, (s) => s.memory.late);
  const canStart = useView(checkout, (s) => check(s, Checkout.E.Start())._tag === "Allowed");
  const canReconcile = useView(checkout, (s) => check(s, Checkout.E.Reconcile())._tag === "Allowed");
  return (
    <>
      {late?.status === "Pending" && <p role="status">Your previous order is still being processed…</p>}
      {canReconcile && <button onClick={() => checkout.send(Checkout.E.Reconcile())}>Check previous order</button>}
      <button disabled={!canStart} onClick={() => checkout.send(Checkout.E.Start())}>Checkout</button>
    </>
  );
}
```

```ts
// checkout.test.ts — the host, with a held order service
import { check } from "flow-state";
import { story } from "flow-state/testing";
import { Checkout } from "./checkout.definition";
import { CheckoutMachine } from "./checkout.machine";

const { E, S } = Checkout;

export const cancelWhilePlacing = story
  .machine(CheckoutMachine, {
    id: "Checkout/cancel-while-placing",
    input: { cartId: "C-1" },
    fixtures: [AddressesFixture.valid, OrdersFixture.heldThenSucceeds({ after: "10 seconds" })],
  })
  .send(E.Start()).process()
  .send(E.ADDRESS.street.Changed({ value: "1 Main St" }))
  .send(E.ADDRESS.city.Changed({ value: "Springfield" }))
  .send(E.ADDRESS.Next()).process()
  .send(E.REVIEW.Yes()).process()                       // PLACING: the order is invoked and held
  .send(E.Cancel()).process().checkpoint("cancelled")
  .advance("10 seconds").process().checkpoint("settled")
  .send(E.Reconcile()).process().checkpoint("reconciled");

test("a cancelled order cannot be placed twice, and its success is recovered", async () => {
  const run = await cancelWhilePlacing.run();
  const cancelled = run.checkpoints.cancelled.snapshot;
  expect(S.CART.is(cancelled)).toBe(true);
  expect(cancelled.memory.late?.status).toBe("Pending");            // in the Cancel turn itself
  expect(check(cancelled, E.Start())).toMatchObject({ _tag: "Denied", reasons: [{ code: "PreviousOrderUnresolved" }] });
  expect(run.checkpoints.settled.snapshot.memory.late?.status).toBe("Placed");
  expect(S.PLACED.is(run.checkpoints.reconciled.snapshot)).toBe(true);
});
```

### 4.8 Dispatch Desk: the ticket editor, with the autosave fix

**The bug in today's editor.** Today `EDITING` has an autosave schedule with
`restartOn: ({ memory }) => memory.draft`. Three transitions *enter* EDITING with the newer draft
already committed:

- OPEN's `TitleChanged` from SAVED, FAILED or UNCERTAIN;
- the "draft moved on" alternative after `Saved`.

Machines O5 makes `restartOn` silent on entry, so none of them autosaves. The `editedWhileSaving`
Story's expectation cannot hold.

**The fix.**

- The autosave is a `Debounce` trait **on OPEN**, which survives all those transitions.
- Every edit and the "draft moved on" exit raise `autosave.Input`.
- `onSettled` saves only from EDITING; otherwise it consumes the firing.
- Machines O5 is amended to say that the entry baseline is the entering turn's committed memory.
- Raising into a trait on a node the same transition enters is a construction error (rule 11), so
  the trap cannot be rebuilt with a trait.

**Other changes:**

- SAVING plus LOCKED become one subroutine, `SAVING: SaveTitle`. The lock counter is the
  subroutine's memory, so the hand resets of `lockRetries` disappear.
- The save `request` is captured when SAVING is entered.
- A save left mid-flight is recorded by `abandoned`.

There is no node memory, so `error` stays in root memory. The UI reads it only while FAILED is
active, so it is never shown stale.

```ts
// editor.definition.ts
import { Schema } from "effect";
import { Attempt, definition } from "flow-state";
import { CommitWithRetry, Debounce } from "../../../fragments/fragments.js";
import { Session } from "../../Session/session.definition.js";
import { TicketsDomain } from "../ticket.domain.js";
import { technicianUpdates } from "../ticket.operations.js";

// The confirmed save: sends the title captured when SAVING is entered, backs off while the
// ticket is locked, and returns how it ended.
export const SaveTitle = CommitWithRetry(
  {
    request: { workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String },
    result: { title: Schema.String },
  },
  { maxRetries: 5, backoff: "5 seconds" },
);

export const Editor = definition({
  id: "DispatchDesk/Editor",
  states: [
    { OPEN: ["EDITING", { SAVING: SaveTitle }, "SAVED", "FAILED", "UNCERTAIN", "RECONCILING"] },
    "CLOSED",
  ],
  traits: { autosave: Debounce({ wait: "2 seconds" }).at("OPEN") },   // lives exactly as long as OPEN
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
  memory: {
    workspaceId: Schema.String,
    ticketId: Schema.String,
    draft: Schema.String,
    saved: Schema.String,
    error: Schema.String,                                   // shown only while FAILED
    // a save the editor no longer waits for: still running, or settled with an unknown result
    unsettled: Schema.NullOr(Schema.Struct({ attempt: Attempt, settled: Schema.Boolean })),
  },
  initial: ({ input }) => ({
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
    draft: "",
    saved: "",
    error: "",
    unsettled: null,
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
  if (memory.unsettled !== null) return deny("PreviousSaveUnresolved");   // L7
  if (memory.draft.trim() === "") return deny("EmptyTitle");
  if (memory.draft.length > MAX_TITLE)
    return deny("TitleTooLong", { length: memory.draft.length, max: MAX_TITLE });
  return true;
};

const savedToast = (title: string) => ({ text: `Saved “${title}”` });

export const EditorMachine = machine(Editor, ({ S, E, O }) => {
  // Re-issues the uncertain attempt itself (same input, same attempt id), never a new one.
  // The UNCERTAIN guard below ensures `unsettled` is set and settled.
  const reconcile = O.Tickets.saveTitle.retry(({ memory }) => memory.unsettled!.attempt, {
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

  return {
    default: S.OPEN,

    onContext: [
      { select: ({ context }) => context.canEdit, when: (canEdit) => !canEdit, event: E.PermissionRevoked },
    ],

    // Root handlers apply in CLOSED too: a reconcile that settles after Close still lands.
    on: {
      PermissionRevoked: { target: S.CLOSED, actions: [O.Tickets.saveTitle.cancel(ticketKey)] },
      Reconciled: {
        target: "self",
        updateMemory: ({ event }) => ({ saved: event.title, unsettled: null }),
        actions: [toastReconciled],
      },
      ReconcileFailed: { target: "self", updateMemory: () => ({ unsettled: null }) },
      StillUncertain: { target: "self" },
    },

    traits: {
      autosave: {
        callbacks: {
          // A filling is a total handler: with nothing to save, the firing is consumed.
          // SAVING is inside OPEN, the trait's placement node (rule 7).
          onSettled: [
            {
              target: S.OPEN.SAVING,
              guard: (i) =>
                i.state !== "OPEN.EDITING"
                  ? deny("NotEditing")
                  : i.memory.draft === i.memory.saved
                    ? deny("NothingToSave")
                    : canSave(i),
            },
            { target: "self" },
          ],
        },
      },
    },

    states: {
      OPEN: {
        default: S.OPEN.EDITING,
        activities: {
          // value fires only when the confirmed ticket changes, so `saved` holds what the server confirmed
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
          // From SAVED, FAILED or UNCERTAIN: editing again. OPEN survives, so its trait may be raised into.
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
              // "self", not re-entry, while already editing
              TitleChanged: {
                target: "self",
                updateMemory: ({ event }) => ({ draft: event.title }),
                raise: [E.autosave.Input],
              },
              SaveRequested: { target: S.OPEN.SAVING, guard: canSave },
              // With edits, Escape discards them; without, it falls through to OPEN and closes.
              Escape: {
                target: "self",
                guard: ({ memory }) => memory.draft !== memory.saved || deny("NothingToDiscard"),
                updateMemory: ({ memory }) => ({ draft: memory.saved }),
              },
            },
          },
          SAVING: {
            // read after the entering transition's updates: the draft as it is now
            input: ({ memory }) => ({ request: { ...ticketKey({ memory }), title: memory.draft } }),
            requests: {
              send: {
                // tickets.saveTitle is declared with concurrency "reject"
                operation: ({ results }) =>
                  O.Tickets.saveTitle.commit(({ payload }) => payload, {
                    outcomes: {
                      success: results.Done.from((ticket) => ({ title: ticket.title })),
                      failure: {
                        TitleRejected: results.Rejected.from(({ reason }) => ({ reason })),
                        TicketNotFound: results.Rejected.from(() => ({ reason: "This ticket no longer exists" })),
                        TicketLocked: results.Busy.from(({ lockedBy }) => ({ reason: `Locked by ${lockedBy}` })),
                      },
                    },
                  }),
                // Left mid-save (CancelSave, Escape, Close, revoked permission). A success also reaches
                // `saved` through the ticket subscription, because the commit's writes update the cache.
                abandoned: {
                  updateMemory: ({ payload }) => {
                    switch (payload.outcome) {
                      case "pending":
                        return { unsettled: { attempt: payload.attempt, settled: false } };
                      case "success":
                      case "failure":
                      case "notSent":
                        return { unsettled: null };
                      default:                              // unknown, interrupt, defect
                        return { unsettled: { attempt: payload.attempt, settled: true } };
                    }
                  },
                },
              },
            },
            exits: {
              Done: [
                {
                  target: S.OPEN.SAVED,
                  guard: ({ payload, memory }) => payload.title === memory.draft || deny("DraftMovedOn"),
                  updateMemory: ({ payload }) => ({ saved: payload.title }),
                  actions: [toastSaved],
                },
                {
                  // typed during the save: back to EDITING, and the newer draft autosaves
                  target: S.OPEN.EDITING,
                  updateMemory: ({ payload }) => ({ saved: payload.title }),
                  actions: [toastSaved],
                  raise: [E.autosave.Input],
                },
              ],
              GaveUp: {
                target: S.OPEN.FAILED,
                updateMemory: ({ payload }) => ({ error: `${payload.reason}; gave up after ${payload.attempts} retries` }),
              },
              Rejected: { target: S.OPEN.FAILED, updateMemory: ({ payload }) => ({ error: payload.reason }) },
              Uncertain: {
                target: S.OPEN.UNCERTAIN,
                updateMemory: ({ payload }) => ({ unsettled: { attempt: payload.attempt, settled: true } }),
              },
            },
            on: {
              // Typing during a save is kept; Done compares it. No raise: the Done exit raises instead.
              TitleChanged: { target: "self", updateMemory: ({ event }) => ({ draft: event.title }) },
              CancelSave: { target: S.OPEN.EDITING, actions: [O.Tickets.saveTitle.cancel(ticketKey)] },
            },
          },
          SAVED: {},
          FAILED: { on: { SaveRequested: { target: S.OPEN.SAVING, guard: canSave } } },
          // The save may or may not have reached the server; retrying reuses the same attempt.
          UNCERTAIN: {
            on: {
              SaveRequested: {
                target: S.OPEN.RECONCILING,
                guard: ({ memory }) => memory.unsettled?.settled === true || deny("NothingToRetry"),
                actions: [reconcile],
              },
            },
          },
          RECONCILING: {
            on: {
              TitleChanged: { target: "self", updateMemory: ({ event }) => ({ draft: event.title }) },
              Reconciled: [
                {
                  target: S.OPEN.SAVED,
                  guard: ({ event, memory }) => event.title === memory.draft || deny("DraftMovedOn"),
                  updateMemory: ({ event }) => ({ saved: event.title, unsettled: null }),
                  actions: [toastReconciled],
                },
                {
                  target: S.OPEN.EDITING,
                  updateMemory: ({ event }) => ({ saved: event.title, unsettled: null }),
                  actions: [toastReconciled],
                  raise: [E.autosave.Input],
                },
              ],
              ReconcileFailed: {
                target: S.OPEN.FAILED,
                updateMemory: ({ event }) => ({ unsettled: null, error: event.reason }),
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

Two notes on rule 11 for this machine. Root `Reconciled` and RECONCILING's `Reconciled` are
separate handlers, and the nearest one wins, so neither is a fused overlap. The `Done` exit's
second alternative writes `saved` and raises into the trait; nothing else in that fused turn
writes `saved`.

```tsx
// EditorPanel.tsx
import type { ReactNode } from "react";
import { check } from "flow-state";
import { useView } from "flow-state/react";
import { Editor } from "./editor.definition.js";
import type { EditorMachine } from "./editor.machine.js";

const { S, E } = Editor;

const saveHints = new Map([
  ["TitleTooLong", "Titles are limited to 200 characters."],
  ["EmptyTitle", "A ticket needs a title."],
  ["NoPermission", "You can view this ticket but not edit it."],
  ["PreviousSaveUnresolved", "Your last save is still being confirmed."],
]);

export function EditorPanel({ editor }: { editor: Actor<typeof EditorMachine> }) {
  const top = useView(editor, (s) => S.root.child(s));     // "OPEN" | "CLOSED"
  const step = useView(editor, (s) => S.OPEN.child(s));    // undefined while CLOSED
  const draft = useView(editor, (s) => s.memory.draft);
  const saved = useView(editor, (s) => s.memory.saved);
  const save = useView(editor, (s) => check(s, E.SaveRequested()));
  const error = useView(editor, (s) => (S.OPEN.FAILED.is(s) ? s.memory.error : ""));
  const lock = useView(editor, (s) => s.memory.SAVING?.lastBusy ?? null);
  const pendingEarlier = useView(editor, (s) => s.memory.unsettled?.settled === false);

  if (top === "CLOSED")
    return (
      <section>
        <h2>{saved}</h2>
        <button onClick={() => editor.send(E.Reopen())}>Edit</button>
      </section>
    );

  const hint =
    save._tag === "Denied" ? save.reasons.map((r) => saveHints.get(r.code)).find(Boolean) : undefined;

  const status = {
    EDITING: null,
    SAVING: (
      <>
        <button onClick={() => editor.send(E.CancelSave())}>Cancel</button>
        {lock && <span role="status">{lock}. Retrying automatically…</span>}
      </>
    ),
    SAVED: <span role="status">Saved</span>,
    FAILED: <p role="alert">{error}</p>,
    UNCERTAIN: (
      <p role="status">
        We couldn't confirm your last save. <button onClick={() => editor.send(E.SaveRequested())}>Retry the same save</button>
      </p>
    ),
    RECONCILING: <span role="status">Checking your last save…</span>,
  } satisfies Record<NonNullable<typeof step>, ReactNode>;

  return (
    <section onKeyDown={(event) => event.key === "Escape" && editor.send(E.Escape())}>
      <label>
        Title
        <input value={draft} maxLength={240} onChange={(e) => editor.send(E.TitleChanged({ title: e.target.value }))} />
      </label>
      <footer>
        <button disabled={save._tag !== "Allowed"} onClick={() => editor.send(E.SaveRequested())}>Save</button>
        {hint && <p className="hint">{hint}</p>}
        {step && status[step]}
        {pendingEarlier && <span role="status">An earlier save is still finishing…</span>}
        <button onClick={() => editor.send(E.Close())}>Done</button>
      </footer>
    </section>
  );
}
```

```ts
// editor.test.ts — the autosave fix, end to end
import { story } from "flow-state/testing";
import { Editor } from "./editor.definition.js";
import { EditorMachine } from "./editor.machine.js";

const { S, E } = Editor;

export const editedWhileSaving = story
  .machine(EditorMachine, {
    id: "Editor/edit-while-saving",
    input: { workspaceId: "W", ticketId: "T-42" },
    context: { canEdit: true },
    fixtures: [TicketsFixture.savesAfter({ delay: "2 seconds" })],
  })
  .process()                                                       // ticket loaded
  .send(E.TitleChanged({ title: "Replace foyer light" }))
  .send(E.SaveRequested())
  .process()
  .send(E.TitleChanged({ title: "Replace foyer lights" }))        // typed during the save
  .advance("2 seconds").process().checkpoint("saved-with-newer-draft")
  .advance("2 seconds").process().checkpoint("autosaving-newer-draft")
  .advance("2 seconds").process().checkpoint("newer-draft-saved");

test("an edit made during a save stays unsaved, and is autosaved next", async () => {
  const run = await editedWhileSaving.run();
  const after = run.checkpoints["saved-with-newer-draft"].snapshot;
  expect(after.memory.saved).toBe("Replace foyer light");
  expect(after.memory.draft).toBe("Replace foyer lights");
  expect(S.OPEN.EDITING.is(after)).toBe(true);
  // the Done exit raised autosave.Input into the trait on OPEN, so this now holds
  expect(S.OPEN.SAVING.is(run.checkpoints["autosaving-newer-draft"].snapshot)).toBe(true);
  const done = run.checkpoints["newer-draft-saved"].snapshot;
  expect(S.OPEN.SAVED.is(done)).toBe(true);
  expect(done.memory.saved).toBe("Replace foyer lights");
});
```

One known gap, documented: typing during SAVING does not raise `Input`, because the `Done` exit
does that. If that save ends in FAILED, the newer draft waits for the next keystroke or an explicit
Save.

---

## 5. Testing a fragment: `story.machine`

`story.machine(fragment, { id, input?, guards?, requests? })` wraps a trait or subroutine in a
generated **harness actor**. It uses fixtures, never injection, so Testing O3 and O5 stand.

- **Placement.** A trait sits at the harness root. A subroutine is the harness's only state:
  `.enter(input)` enters it through a real transition (so `start` runs), and `.leave()` abandons
  it.
- **Events.** The fragment's `events` and `hostEvents` are the harness's public events at the same
  paths; the harness raises the `hostEvents`.
- **Fillings.** `guards` come from the options. Callbacks, exits and `abandoned` get recording
  handlers. Every port is filled, so omissions are not silently allowed.
- **Requests.** Each request is bound to a generated transaction (commit, concurrency `reject`) or
  resource (read). The adapter is the given function `(payload, { attempt }) => Effect`, whose
  failure `_tag` must name a failure result. Outcomes come through real paths:
  - success and tagged failure from the adapter;
  - `Effect.die` gives `defect`, and `Effect.interrupt` gives `interrupt`;
  - `.cancel(request)` runs the harness's cancel. On a held adapter (after invocation) that gives
    `unknown`; with no adapter call yet, `notSent`.
- **Cuts** expose `snapshot` (the harness), `piece` (the fragment's slice), `calls`, `requests`,
  `exit` and `abandoned`.

`model(story.machine(fragment, …), { stateKey })` explores small fragments completely. A host
still needs its own Stories for wiring, permissions, abandonment, persistence and late results,
as section 4.7 shows.

---

## 6. `flow check` and `flow graph`

**Errors**

1. **Type mirror.** `flow check` reports every type error in rules 1–14 for untyped callers:
   - placement and nesting (no subroutine in a subroutine; requests only on fragments placed
     directly by a machine);
   - unfilled ports;
   - exhaustive exit, result and failure-tag maps;
   - fixed standard-outcome shapes;
   - token origin;
   - raise and callback targets;
   - I/O in fragments;
   - instance names;
   - literal deny codes.
2. **Stuck waiting (A7).** A fragment state that handles only request results is reachable with
   nothing outstanding.
3. **No way out (L4).** A subroutine with no reachable exit and no host transition that leaves it.
4. **Non-total delivery (T1).** A state reachable while a call is outstanding lacks an unguarded
   handler for some result event and does not leave. Or a raise or notify reachable from a result
   handler, an exit filling or a timer-fired handler reaches a handler that can decline.
5. **Raise structure.** A raise cycle; a raise into a child whose node the same transition enters
   or leaves; two fused parts with non-self targets; overlapping memory keys across fused parts,
   including a `pending` record and its leaving transition.
6. **`hostEvents` coverage.** A `hostEvent` with no handler at the fragment's root and none in some
   leaf.
7. **Admission.** A subroutine on the admission path.
8. **Calls.** A path that issues a request while a call to it may be outstanding.
9. **H4/H5.** A commit's `unknown`, `interrupt` or `defect` mapped to an event whose handler can
   reach a fresh send of the same request in the same activation. (`notSent` may retry; it is
   guaranteed never invoked.)
10. **Concurrency.** A commit request bound to an operation whose concurrency is `allow`.
11. **Callback scope.** A callback filling whose target lies outside the trait's placement node.

**Warnings**

12. A public fragment event unhandled in a reachable fragment state, reported at its full path.
13. A dead contract: a guard never used, a callback never notified, a request never sent, or an exit
    never reached.
14. A fragment exit taken while one of its commits may be outstanding (its result goes to
    `abandoned`).
15. **T2.** A host `restartOn` schedule on a state that is entered by the transition that changes
    its selected value.
16. An explicit target that re-enters a node with traits, or a subroutine's state, while it is
    active (it resets them; suggest `"self"`).
17. A fragment used by only one machine (info).
18. A changed fragment shape (id, version, Schema parameters) without a version bump on a persisted
    host (`flow diff`).

**What `flow check` cannot prove:**

- what closures compute: guards, selectors, `hostEvent` handlers (D3);
- whether a host uses `abandoned` to stop a second submit (L5, L7);
- whether exits carry drafts (D7).

**`flow graph`**

- Each instance is a collapsible cluster labelled `instance: Id (trait|subroutine)`, drawn on its
  node. Collapsed, a subroutine is one host state with one edge per exit.
- **Edges:**
  - **requests:** from the sending transition to the operation, with result back-edges;
  - **`abandoned`:** a `pending` edge on every leaving transition, and terminal outcomes as host
    turns;
  - **raise and notify:** drawn as part of their source transition;
  - **`start`:** drawn on every edge into the step.
- **`flow explain`:** for example,
  `flow explain Checkout ADDRESS.EDITING ADDRESS.street.Changed` shows `Field`'s handler, its guard
  filled by `AddressStep`, and its deny code `Verifying`.

---

## 7. Against the problems

"Prevents" means enforced by types, construction or a `flow check` error. Anything weaker is
labelled.

| # | Verdict | How |
| --- | --- | --- |
| L1 stale timers | **prevents** | Schedules stop with their node or step, and arming ids discard firings queued before a restart. |
| L2 late results | **prevents** | Call ids; only the current call is delivered. |
| L3 leftover memory | **prevents (in fragments)** | Each activation runs `initial`. Host memory is still shared by all host states (node memory is deferred). |
| L4 no way out | **prevents** | The host may always abandon (check 3). A pure-code defect leaves the step in place, but the host can still leave it. |
| L5 abandoned effects | **prevents (the route); by convention (its use)** | `abandoned` is required, durable and next to its operation. |
| L6 silent admission | **prevents** | `notSent` for commits and `interrupt` for reads when a call never runs; `allow` is forbidden; one outstanding call. |
| L7 departure gap | **prevents (the record); by convention (the guard)** | `pending` is written in the leaving turn. Checkout's `Start` and the editor's `canSave` read it. |
| L8 phantom replies | **prevents** | Call ids. Stories get results only through fixtures. |
| E1 broken invariants | **prevents** | Only declared guards refuse public events, and a declined fused part declines the whole transition. |
| E2 interfaces growing with depth | **prevents (allows public events, by choice)** | Everything else stops at each level. |
| E3 hidden endings | **prevents** | A callback never leaves its placement node; only exits return. |
| E4 refusal by forwarding | **prevents** | Public events need no forwarding, and a refused raise declines its source. |
| E5 preempting observers | **prevents** | `abandoned` cannot target, raise or notify (types). |
| H1 bypassed policy | **by the author's choice** | `hostEvents` make the host mediate. A public event plus a `{}` callback allows H1. |
| H2 unforeseen checks | **allows, by choice** | Declare a guard in the fragment. |
| H3 faked results | **prevents** | Exits are taken, never sent; `internalEvents` come only from schedules and result maps. |
| H4 misrouted results | **prevents** | Tokens exist only inside their `operation`; success and failure are typed apart; standard outcomes have fixed shapes. |
| H5 interrupt treated as not sent | **prevents** | `interrupt` and `defect` carry the Attempt and are distinct from `notSent`; check 9. |
| D1 drifting copies | **allows, for values pushed in** | Fragment memory is readable everywhere, so nothing is copied *out*. A host value that changes during a step must be pushed in as a `hostEvent` (Poll's `slow`), and that is a copy. This is the cost of cutting live values. |
| D2 live values too late | **prevents** | Request input comes from fragment memory, and selects read only `payload`. |
| D3 feedback loops | **by convention** | Server values arrive as `hostEvents`; whether their handler notifies is fragment code. |
| D4 unmapped outcomes | **prevents** | Two exhaustive maps; a throwing mapper delivers a fixed `defect`. |
| D5 restore in flight | **prevents** | Durable call ids and `abandoned` records; each restored outcome is mapped. |
| D6 same-turn seeding | **prevents** | `input` reads the staged snapshot plus the event or exit payload. |
| D7 drafts lost on abnormal endings | **allows** | Exits can carry drafts (AddressStep `Back`); abandoning drops fragment memory by design. |
| T1 partial turns | **prevents** | Fusion with whole-transition decline and terminal totality. Pure-code defects are bugs and publish issues (rule 13). |
| T2 schedule baseline traps | **prevents for traits; warns for host schedules** | Raising into a trait on an entering node is an error; the O5 baseline is clarified; check 15. |
| A1 forwarding that compounds | **prevents** | |
| A2 two unrelated blocks | **prevents** | One block per instance, with `abandoned` next to its operation. |
| A3 conditional rules | **prevents** | The constructor fixes the kind. The callback rule is one sentence for both kinds. |
| A4 overloaded words | **prevents** | |
| A5 I/O inside fragments | **prevents** | |
| A6 silence discovered late | **prevents** | Every port is required. |
| A7 forgotten first send | **prevents** | `start`; check 2. |

---

## 8. Decisions

Each decision gives what was chosen, why, and what was rejected.

1. **Two constructors, `trait` and `subroutine`.**
   - **Why:** the name states the lifetime at a glance (principle 2), and no "may be either"
     placement exists (principle 6). Every single-constructor proposal ended up conceding the split.
   - **Rejected:** one `fragment` with a derived or declared `kind`.

2. **The fragment declares who sends each event** (`events` / `hostEvents` / `internalEvents`).
   - **Why:** "only the host sends" (prior D11) contradicts "only declared guards refuse" (D10),
     because a forwarding host can refuse `Release` (E4).
   - **Rejected:** host forwarding; host-side `expose`; private-by-default with opt-in.

3. **Live value props are cut.**
   - **Why:** one port fewer, one rule fewer, and no D2 convention gap. A changing value reaches
     the fragment as a `hostEvent` (Poll's `SetSlow`).
   - **Cost:** D1 for pushed values (section 7).
   - **Rejected:** keeping `live` beside `input`.

4. **Subroutines inside subroutines are deferred.**
   - **Why:** removes request relays, nested `start`, nested generations and `abandoned` routing
     through relays, which were the deepest rules in every proposal.
   - **Still allowed:** traits inside subroutines and traits inside traits. A fragment with
     requests must be placed directly by a machine.
   - **Rejected for version 1:** composite steps (a wizard step that contains a confirm).

5. **Trait callbacks may move the host, under one rule:** "a callback never leaves its placement
   node; an exit must" (opus-single).
   - **Why:** idle → LOCKED and hold → WIPING stay possible without a step.
   - **Rejected:** "callbacks never target" (covers less); per-kind wording (contradicted itself).

6. **Every port is required; `{}` means ignore.**
   - **Why:** A6, with nothing silent.
   - **Rejected:** `.optional()`, and omission with an inspection listing.

7. **Read requests are kept.**
   - **Why:** Poll and verify own their reply; D4, L2, D5 and H3/H4 hold for reads too.
   - **Rejected:** reads through host activities or host-mapped refetch.

8. **`raise` is kept, and only into direct children's `hostEvents`.**
   - **Why:** host-fed fragments (Debounce, Field `Set`, Poll `SetSlow`) and E4.
   - **Rejected:** removing same-turn composition (reopens H1, D3, E4, A1).

9. **Request ports are kept.**
   - **Why:** fragment-owned retries, fenced results and kind-checked outcomes (D2, D4, D5, H3–H5,
     L2, L5–L8, A5, A7).
   - **Rejected:** the host mapping outcomes onto fragment events.

10. **Leaving a step mid-commit is allowed.**
    - **Why:** forbidding it trades L5 for L4 on hung adapters. A post-invocation cancel still
      yields `unknown`, so a route stays anyway.
    - **Rejected:** a check error on leaving a sending step.

11. **Entry input is per placement, read after the entering transition's updates, plus the event.**
    - **Why:** one block per instance (A2), one place for several routes in, and D6 prevented by
      construction.
    - **Cost:** one Machines O3 exception, for fresh activations only.
    - **Rejected:** per-edge `S.X.from(…)`, which makes D6 a convention on every entry edge.

12. **`start` is actions on the entering transition, for subroutines only.**
    - **Why:** A7 is checkable, and it runs on an accepted transition, never on restore. Plain
      states keep "no entry actions".
    - **Rejected:** `start` as a transition (only needed by deferred composites); `start` on any
      node (deferred); a zero-delay schedule.

13. **Pre-invocation cancel is `notSent`** (reads answer `interrupt`).
    - **Why:** it is a guaranteed non-invocation, so it is safe to retry. Calling it `interrupt`
      would send the user to reconciliation, and `retry(attempt)` would *perform* the cancelled
      write.
    - **Rejected:** `interrupt` for it.

14. **No `allow` concurrency on request commits.**
    - **Why:** under `allow`, an older write can land last unless every entering edge carries an L7
      guard.
    - **Rejected:** a warning only.

15. **One `abandoned` handler per binding, next to its operation.**
    - **Why:** one place to read what happens to a commit; one `{ outcome, attempt }` shape.
    - **Rejected:** per-outcome handlers (codex-split); a per-operation observer at the root
      (codex-single), which is simpler for gating but far from the binding.

16. **A key written by both the `pending` record and the leaving transition is a construction
    error,** and so is any fused overlap.
    - **Why:** no silent last-writer.
    - **Rejected:** documented order.

17. **A commit `defect` is uncertainty, and a throwing mapper delivers a fixed `defect` with no
    mapper.**
    - **Why:** a defect can follow a real write (round 3 found the double order through
      `defect → Rejected`), and mapping `defect` itself would recurse.
    - **Rejected:** `defect` with a `.from` mapper; `defect` as a rejection.

18. **Traits on any node** (from opus-trait-routine-actor), placed with `.at("PATH")` in the one
    `traits` block.
    - **Why:** the editor's autosave lives exactly as long as OPEN. Lifecycle follows the node.
      Raising into a trait on an entering node is an error, so the T2 trap cannot be built.
    - **Rejected:** root-only traits; per-node `traits` inside the state list (a second compound
      form).

19. **Fillings are total `on`-style handlers** (callbacks, exits, `abandoned`).
    - **Why:** one handler shape everywhere. Guards choose among host reactions and never refuse
      the fragment's decision.
    - **Rejected:** special filling shapes without alternatives.

20. **`notify` instead of callbacks in `actions`** (codex-single).
    - **Why:** a callback can now move the host, so a callback in `actions` would hide a same-turn
      transition inside the finite-work list (Machines O3).
    - **Rejected:** callbacks in `actions`.

21. **Testing through `story.machine`** (from opus-trait-routine-actor).
    - **Why:** fixtures, no injection, and no separate `story.fragment` name.
    - **Rejected:** `story.fragment` and `reply`.

22. **No subroutine on the admission path** (codex-split).
    - **Why:** admission is not a transition, so it has no event and no `start`. The Queue starts
      PAUSED and the panel sends `Resume`.
    - **Rejected:** reading admission input for default-path subroutines, which conflated
      admission with a default entered by a transition.

---

## 9. Deferred

| Item | Why deferred | What it would need |
| --- | --- | --- |
| **Subroutines inside subroutines** (composite steps), with request relays | The deepest rules: relays, nested `start` and generations, `abandoned` through relays | relay tokens with matching kind and results; `start` as a transition for input-bearing first children; durable routing through relays |
| **Node memory** (`memory`/`input`/`initial` on any host state) | Changes the meaning of substates sharing memory; lexical-scope problems found in round 3 (dead `abandoned` scope, ancestors unable to checkpoint) | scoped reads for ancestors, `abandoned` scoped to the root, re-entry semantics |
| **`start` on any node** | Plain states keep "no entry actions"; only subroutines need it in version 1 | an O2/O3 rule for entry actions on every node, plus re-entry warnings |
| **Live value props** | Cut for version 1 (decision 3) | `live` port, rules for arm-time reads, D2 rule for requests |
| **Per-edge input** | Not chosen (decision 11) | `S.X.from(mapper)` on every target |

---

## 10. Open risks

1. **The S1 type spike.** The spike must show, before anything else is built, that TypeScript
   7.0.2 can infer the following without assertions or explicit generics (Package O3):
   - nested `E` paths (`Checkout.E.ADDRESS.street.Changed`);
   - result tokens branded per `operation`, with success and failure typed apart;
   - fixed standard-outcome shapes;
   - Schema-generic fragments (`Field(Schema.String, …)`, `CommitWithRetry({ request, result })`);
   - `.at("PATH")` typed against the definition's states;
   - the `event` union in `input` fillings;
   - fragment-relative `state` unions.

   If inference fails, the fallback is fewer nested paths (instance-level `E` only), not looser
   types.
2. **Verbosity.** `abandoned` switches and exhaustive maps cost 10–15 lines per commit placement.
3. **`check()` evaluating raise payload mappers.** This is a Machines O4 amendment, and a mapper
   defect in `check()` throws.
4. **Host-code dependence.** L5 and L7 depend on host guards reading the `pending` record.
5. **No fragment-alone `notSent` via `reject`.** It needs an App Story with a real conflict, or
   `.cancel` before invocation.

---

## 11. Plan changes

Sizes: **S** is a clause, **M** a paragraph, **L** a new outcome section.

| Plan | Change | Size |
| --- | --- | --- |
| **Machines O1** | `trait`, `subroutine`, `traits` with `.at`, subroutine states, contracts and the machine's filling blocks; instance names and collisions; no subroutine in a subroutine; no subroutine on the admission path; requests only on directly placed fragments | L |
| **Machines O2** | Exits, abandonment, nearest-handler rules across host and fragment; explicit re-entry re-activates traits and steps | M |
| **Machines O3** | Fusion (callbacks via `notify`, exits, raise) with whole-transition decline, disjoint keys and terminal totality; the staged snapshot for step `input` and `start` (one exception); `start` actions on entering transitions; `abandoned` as a turn source with no event; the pure-code defect statement | L |
| **Machines O4** | `check()` evaluates raise payload mappers to supply child guards; it reports the inner deny code | M |
| **Machines O5** | Arming ids on firings, so a restart discards queued firings; **the `restartOn` entry baseline is the entering turn's committed memory**; fragment schedules live with their activation | M |
| **Machines O6** | Request-bound work routes outcomes to the fragment by call id | S |
| **Machines O8** | Fragment slices in `memory`, `undefined` while inactive | S |
| **Operations O2** | Request bindings require `success` and every failure tag (against optional members); standard outcomes route to the fragment with fixed shapes; a fencing exception to "its event reaches the actor's later state"; any result-mapper throw delivers a fixed `defect`; **request-bound reads answer `interrupt` when not run (pre-invocation cancel, never-invoked restore)** | M |
| **Operations O3** | `notSent` for `reject`, pre-invocation cancel and never-invoked restore on request-bound commits; Attempt on `unknown`, `interrupt` and `defect`; request commits may not use `allow`; the `abandoned` route | M |
| **Runtime O4** | Call ids and activation identity; delivery to the current activation only | S |
| **Persistence O6** | Durable call ids and `abandoned` records; an acknowledged in-flight commit restores as `unknown`, a **never-invoked one as `notSent`**, and a pending read as `interrupt` | M |
| **Persistence O2 / ServerRendering O3** | Fragment id, version and Schema parameters in the saved shape and the SSR digest | S |
| **Testing O1** | `story.machine` accepts a fragment (harness actor, `.enter`, `.leave`, `.cancel`, cut fields); O3 and O5 unchanged | M |
| **Inspection O1 / O6** | Fragment tags and clusters; request and `abandoned` edges; raise and notify as part of transitions | M |
| **CommandLine O5** | Checks 1–18 | M |
| **Package O1** | `trait`, `subroutine` in `flow-state` | S |
| **FlowState O2** | A build stage after S3 (Runtime), proved first on the editor's autosave and save-with-retry | S |
