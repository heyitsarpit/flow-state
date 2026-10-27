# One `fragment()`: one constructor, two shapes decided by what it declares

Status: exploration proposal, revision 2. Not accepted. Written against
[principles.md](../principles.md); neither [proposal.md](../proposal.md) nor
[fragments.md](../../fragments.md) is assumed. Where this file and a plan differ, the plan wins.
All code is draft syntax, written by hand and not compiled. The reviews are in [reviews/](reviews/);
section 11 is the round 2 revision log, section 12 the round 1 log.

## 1. The shape in one page

**One constructor, `fragment(config, build)`.** A fragment is behaviour written once and inlined
into a host at construction. The host stays one actor, one mailbox, one turn.

**A fragment is exactly one of two shapes, decided by what its config declares, and placement
follows the shape.**

| If the config declares...                   | It is a...  | Placed in                    | Lifetime                                                                |
| ------------------------------------------- | ----------- | ---------------------------- | ----------------------------------------------------------------------- |
| `exits` (even `exits: {}`) or `states`      | **step**    | `states: [{ NAME: Frag }]`   | while the host is in that state; fresh on every entry; stops on leaving |
| neither                                     | **part**    | `parts: { name: Frag }`      | the container's life; memory starts once                                |

`start` is allowed only in a step (a `start` in a part is a type error and a `flow check` error);
it is not a shape trigger. A step that has neither states nor exits writes `exits: {}`. There is
no fragment that may be placed either way. A container's lifetime is the only lifetime: a part of
a step lives while the step is active.

**What this shape costs, said plainly.** This is the split into trait and subroutine with one
constructor name and the kind inferred from two keys. It expresses nothing the split cannot, and
all three round 1 and 2 reviews note it. The case for one name is modest: one concept to teach, one
config shape, one `story.fragment`. The price is that a reader learns step versus part by scanning
for `exits`/`states` rather than reading a constructor name; the split names it. If review judges
that price too high, the split is a mechanical rename of this proposal.

Prior art for lifetime-by-container: React (`key` resets), TCA (`Scope` always, `ifLet` while
non-nil), XState (`invoke` for a state's lifetime).

### Answers to the open features (concrete)

| Feature                                  | Answer                                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leaving a long-running step from outside | Always allowed: a plain ancestor handler on the placement state. Leaving stops schedules and fences late results. A commit in flight is recorded synchronously in the departure turn (`abandoned.pending`) and its outcome is delivered later (`abandoned.settled`), both non-targeting. |
| Inputs through nested levels             | The fragment declares `events` (public: the UI sends at the full path, `E.ADDRESS.line1.Set`) and `hostEvents` (only the container may raise them). Nothing is forwarded or listed per level.      |
| Endings and results                      | `exits`, declared by the fragment, taken as `exits.X`, mapped exhaustively on the placement state. Host leaving is the other way out; it is never an exit.                                         |
| Required vs optional props               | Required. Values may take `fallback`; a callback is bound to `{}` when the host does not care; guards have no optional form. Silence is written and listed by inspection.                         |
| Schema vs TypeScript                     | Schema for `input`, `events`, `hostEvents`, `memory`, callback payloads, exit payloads and request `input`, `success`, `failure`. TypeScript generics for value props and guards (live functions of the snapshot). |
| `raise` and same-turn ordering           | Fusion over the pre-turn snapshot, into `hostEvents` only, only from handlers of the container's own public events. Whole-turn denial. Never from a reply, exit mapping or timer handler (rule 10). |
| Operation results into fragments         | `request` props. The host maps the operation's success and each failure tag onto kind-correct results the fragment declares; Flow delivers the reserved kinds `NotSent`, `Unknown`, `Interrupted`, `Defected` and the fragment handles them. |
| First send without entry actions         | `start`: the step's initial transition, appended to the entering accepted transition. Never run on restore, hydration, `"self"` or admission, so it cannot sit on the host's default path.          |
| Retries send the confirmed request       | `input` is captured at entry into fragment memory; sends read `memory.request`; the host select reads only `payload`. Retry only on `NotSent` and declared failures, never on `Unknown`, `Interrupted` or `Defected`. |
| No autosave loops                        | Edit counter fed only by user events, separate flight and failure flags, and a trailing-edit flush. A pattern, not an enforced rule (D3).                                                          |
| Exhaustive outcomes                      | Host `outcomes` must cover the operation's success and every failure tag, onto results of the right kind. The fragment must handle every result and reserved event in each state that sends (check). |
| Testing a fragment alone                 | `story.fragment(...)` generates the host (section 6); fixtures supply outcomes.                                                                                                                    |
| Deep static analysis                     | Section 8: 17 checks, each marked exact or heuristic.                                                                                                                                              |

## 2. Prior decisions: kept, changed, dropped

"Prior art D#" are the decisions in [fragments.md](../../fragments.md) section 13. They are
evidence, not rules.

| Decision                                         | Here                      | Reason                                                                                                                                                              |
| ------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 fragments contain fragments                   | kept                      | Needed for the wizard. All inlined.                                                                                                                                  |
| D2 nested names readable                         | kept for reads and for public sends | Reads avoid copies. A fragment's public `events` are sendable at their full path through any nesting.                                                      |
| D3 no depth limit                                | kept                      | Ten-segment state path limit is enough.                                                                                                                              |
| D4 callbacks; D6 fragment owns its contract     | kept                      | React props and callbacks, Angular `input.required`/`output`. Extended by `request`.                                                                                  |
| D5 steps end only by exits; D7 exit syntax       | kept                      | UML submachine exit points; XState final-state `output`. One rule for callbacks and exits: a callback never leaves its container; an exit must (opus-single).           |
| D8 no `bind`; machine-side block                 | changed                   | Props are supplied beside the placement. The key is `parts`, not `embeds`.                                                                                            |
| D9 host cannot reach inside                      | kept                      | The host never names an internal event; it maps onto declared results only.                                                                                           |
| D10 guards only where declared                   | kept                      | Plus the E4 rule: an event the fragment needs always delivered is public (opus-split's argument that D10 and D11 conflict).                                           |
| D11 only the host sends                          | changed                   | The fragment declares who sends: `events` public, `hostEvents` container-only. Round 1's host-side `expose` and `unrefusable` are removed (principles review: no failure case of its own). |
| D12 two kinds; D13 `trait`/`subroutine`          | dropped as constructors; kept as inferred shapes | See section 1.                                                                                                                                        |
| proposal.md: host maps outcomes onto internal events | dropped               | Leaked internal events; replaced by kind-correct results and Flow-delivered reserved kinds.                                                                            |

Borrowed, briefly:

- **UML submachine state** (exit points, inlined semantics): `exits`; `start` is the UML
  initial-transition effect.
- **XState v5** ([setup](https://stately.ai/docs/setup), [input](https://stately.ai/docs/input),
  [invoke](https://stately.ai/docs/invoke), [final output](https://stately.ai/docs/final-states)):
  `input` captured once; invoked work stops with its state; named slots supplied by the user is the
  model for `props`. XState relies on `spawn` and
  [parallel states](https://stately.ai/docs/parallel-states) for what a part does; Flow forbids both,
  so parts are fused fragments with no states.
- **SCXML** ([spec](https://www.w3.org/TR/scxml/)): events from a cancelled invocation are ignored
  (generation fencing); `donedata` precedes exit payloads.
- **React** ([props](https://react.dev/learn/passing-props-to-a-component)): props, callbacks, `key`.
- **Elm** ([architecture](https://guide.elm-lang.org/architecture/)): OutMsg is `callback`/`exits`.
- **Redux Toolkit** ([createSlice](https://redux-toolkit.js.org/api/createSlice)): namespaced slices.
- **Effect** ([layers](https://effect.website/docs/requirements-management/layers/)): requirements in
  the type until provided; exhaustive tag mapping.
- **Rust/Scala traits** ([Rust](https://doc.rust-lang.org/book/ch10-02-traits.html),
  [Scala](https://docs.scala-lang.org/tour/traits.html)): required members the implementer supplies.
- From the other proposals: **opus-split** for the outcome division, result kinds, `notSent` versus
  `interrupt`, and the public-versus-host event argument; **codex-split** for the synchronous
  `abandoned.pending`, terminal totality, mapper defects delivered as `Defected`, and the Attempt
  on interrupt and defect; **codex** for the abandoned route, payload-only host select and restore
  of reads as `interrupt`; **opus-single** for the one callback-and-exit rule and whole-turn denial;
  **sonnet-split** for barring `start` from the default path.

## 3. The contract

Everything a fragment needs or offers is declared in its config. The host adapts.

| Declared by the fragment      | Keyword (draft)                                                          | The host supplies                                                                                |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Data captured at start        | `input: { start: Schema.String }`                                        | in the definition: a pure function of actor input (part) or of staged host memory (step)          |
| A live value                  | `props: { current: prop<string>() }` (`{ fallback }` optional)           | in the machine: a function of the snapshot                                                        |
| A moment the host may act on  | `props: { onSettled: callback({ value: Schema.String }) }`               | `{ actions?, updateMemory? }`, never a target out of the container; `{}` to do nothing            |
| A check only the host can make | `props: { canEdit: guard() }`                                           | `({ memory }) => true \| deny("Locked")`                                                          |
| I/O the host runs             | `props: { save: request.commit({ input, success, failure }) }`           | `({ R }) => O.x.commit(({ payload }) => ..., { outcomes, abandoned? })`                           |
| How a step can end            | `exits: { Done: {}, Failed: { reason } }`                                | on the placement state: a state, or `{ target, updateMemory?, actions? }`                         |
| Who may send                  | `events` (public, anyone, full path), `hostEvents` (container only)     | nothing for `events`; the container raises `hostEvents`                                           |

## 4. Examples (full code)

```ts
// fragments.ts
import { fragment, prop, callback, guard, request, deny, Attempt } from "flow-state";
import { Schema, Duration } from "effect";
```

A request prop `save` creates these events inside its fragment, namespaced by the prop key:
one success result and each failure tag as declared (`save.Done`, `save.Locked`), and the
reserved kinds `save.NotSent` (guaranteed never invoked; no payload), `save.Unknown`,
`save.Interrupted` and `save.Defected` (commits only; each carries `{ attempt }`; an adapter may
have been invoked). A read has `Interrupted` and `Defected` without an Attempt and has no
`NotSent` or `Unknown`. The host can map none of the reserved kinds.

### 4.1 Debounce (a part)

Fixes: L1, T2. Inside a part, `restartOn` leaves the schedule idle on entry (Machines O5), so no
`Due` fires until the first `Input`. A debounce inside a step entered by the very edit it should
debounce cannot work: raising `Input` into a fragment being entered this turn is rejected by
`flow check` (check 2).

```ts
// fragments.ts
export const Debounce = (p: { wait: Duration.Input }) =>
  fragment(
    {
      id: "Debounce",
      hostEvents: { Input: {} },                   // only the container may raise it
      internalEvents: { Due: {} },                 // only this fragment's schedule sends it
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
```

```ts
// search-box.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Debounce } from "./fragments";

export const SearchBox = definition({
  id: "Catalog/SearchBox",
  states: ["IDLE"],
  parts: { query: Debounce({ wait: "300 millis" }) },   // a part: no exits, no states
  events: { Type: { text: Schema.String } },
  memory: { text: Schema.String, searched: Schema.String },
  initial: () => ({ text: "", searched: "" }),
  operations: { Catalog: CatalogDomain },
});
```

```ts
// search-box.machine.ts
import { machine } from "flow-state";
import { SearchBox } from "./search-box.definition";

export const SearchBoxMachine = machine(SearchBox, ({ S, E, O }) => ({
  default: S.IDLE,
  parts: {
    query: {
      props: {
        onSettled: {
          actions: [O.Catalog.search.refetch(({ memory }) => ({ q: memory.text }))],
          updateMemory: ({ memory }) => ({ searched: memory.text }),
        },
      },
    },
  },
  on: {
    // Type is the container's own public event: it may raise into the part's hostEvents (rule 10)
    Type: { target: "self", updateMemory: ({ event }) => ({ text: event.text }), raise: [E.query.Input] },
  },
  states: { IDLE: {} },
}));
```

```tsx
// SearchBoxView.tsx
const box = useActor(SearchBoxMachine);
const searched = useView(box, (s) => s.memory.searched);
const pending = useView(box, (s) => s.memory.query.seq);            // readable; nothing can write it
<input onChange={(e) => box.send(SearchBox.E.Type({ text: e.target.value }))} />
// box.send(SearchBox.E.query.Input())   // type error: Input is a hostEvent
```

### 4.2 Validated field (a part, and fresh inside a step)

Fixes: D1 (error is the field's own memory), E1, E4. `Set` is guarded where the field says;
`Blur` is public, so it reaches the field directly and no host code can refuse it.

```ts
// fragments.ts
export const TextField = (p: { validate: (value: string) => string | null }) =>
  fragment(
    {
      id: "TextField",
      input: { start: Schema.String },
      events: { Set: { value: Schema.String }, Blur: {} },   // public
      memory: { value: Schema.String, error: Schema.NullOr(Schema.String), touched: Schema.Boolean },
      initial: ({ input }) => ({ value: input.start, error: p.validate(input.start), touched: false }),
      props: { canEdit: guard() },
    },
    ({ props }) => ({
      on: {
        Set: {
          target: "self",
          guard: props.canEdit,
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
        },
        Blur: { target: "self", updateMemory: () => ({ touched: true }) },
      },
    }),
  );
```

```ts
// profile.definition.ts
export const required = (v: string) => (v.trim() === "" ? "Required" : null);

export const Profile = definition({
  id: "Account/Profile",
  states: ["EDITING", "SAVED"],
  parts: {
    name: {
      fragment: TextField({ validate: required }),
      input: ({ input }) => ({ start: input.name }),    // data: a pure function of actor input
    },
  },
  events: { Save: {} },
  input: { name: Schema.String, locked: Schema.Boolean },
  memory: { locked: Schema.Boolean },
  initial: ({ input }) => ({ locked: input.locked }),
});
```

```ts
// profile.machine.ts
export const ProfileMachine = machine(Profile, ({ S }) => ({
  default: S.EDITING,
  parts: {
    name: { props: { canEdit: ({ memory }) => !memory.locked || deny("Locked") } },
  },
  states: {
    EDITING: {
      on: {
        // reads the part's memory; keeps no copy of the error
        Save: { target: S.SAVED, guard: ({ memory }) => memory.name.error === null || deny("Invalid") },
      },
    },
    SAVED: {},
  },
}));
```

```tsx
// ProfileView.tsx
const profile = useActor(ProfileMachine, { input: { name: "Ada", locked: false } });
const error = useView(profile, (s) => (s.memory.name.touched ? s.memory.name.error : null));
<input
  value={useView(profile, (s) => s.memory.name.value)}
  onChange={(e) => profile.send(Profile.E.name.Set({ value: e.target.value }))}   // same path as the read
  onBlur={() => profile.send(Profile.E.name.Blur())}
/>;
```

### 4.3 Confirm (a step with two exits)

Fixes: L3, E3, H3. `Yes` and `No` are public: the UI sends them at `E.ARCHIVE_ASK.Yes`.

```ts
// fragments.ts
export const Confirm = fragment(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    exits: { Confirmed: {}, Declined: {} },        // declares exits, so this is a step
  },
  ({ exits }) => ({
    on: { Yes: exits.Confirmed, No: exits.Declined },
  }),
);
```

```ts
// project.definition.ts
export const Project = definition({
  id: "Work/Project",
  states: ["VIEWING", { ARCHIVE_ASK: Confirm }, "ARCHIVED"],
  events: { Archive: {} },
});
```

```ts
// project.machine.ts
export const ProjectMachine = machine(Project, ({ S }) => ({
  default: S.VIEWING,
  states: {
    VIEWING: { on: { Archive: S.ARCHIVE_ASK } },
    ARCHIVE_ASK: {
      exits: { Confirmed: S.ARCHIVED, Declined: S.VIEWING },      // exhaustive: a missing key is a type error
    },
    ARCHIVED: {},
  },
}));
```

```tsx
// ProjectView.tsx
const project = useActor(ProjectMachine);
const asking = useView(project, (s) => Project.S.ARCHIVE_ASK.is(s));
asking && (<>
  <button onClick={() => project.send(Project.E.ARCHIVE_ASK.Yes())}>Archive</button>
  <button onClick={() => project.send(Project.E.ARCHIVE_ASK.No())}>Keep</button>
</>);
```

### 4.4 Commit with retry (a step with states, a request, `start`, exits, `abandoned`)

Fixes: L1, L2, L5, L6, L7, H4, H5, E5, D2, D4, D6, A7. It retries only when the commit was
provably not sent (`NotSent`) or the server said it was locked (`Locked`). `Unknown`,
`Interrupted` and `Defected` may have reached the server, so they end in the `Uncertain` exit with
the Attempt and are never re-sent.

```ts
// fragments.ts
export const CommitWithRetry = <Req, ReqI>(p: {
  request: Schema.Schema<Req, ReqI>;
  maxRetries: number;
  backoff: Duration.Input;
}) =>
  fragment(
    {
      id: "CommitWithRetry",
      input: { request: p.request },                        // captured at entry (D2)
      states: ["SENDING", "BACKOFF"],
      internalEvents: { Retry: {} },
      memory: { request: p.request, attempts: Schema.Int },
      initial: ({ input }) => ({ request: input.request, attempts: 0 }),
      props: {
        // creates events save.Done, save.Locked, save.Rejected and the reserved save.NotSent,
        // save.Unknown, save.Interrupted, save.Defected
        save: request.commit({
          input: p.request,
          success: { Done: {} },                            // exactly one success result
          failure: { Locked: {}, Rejected: { reason: Schema.String } },
        }),
      },
      exits: {
        Done: {},
        GaveUp: {},
        Failed: { reason: Schema.String },
        Uncertain: { attempt: Attempt },
      },
    },
    ({ S, E, props, exits }) => {
      const send = props.save.send(({ memory }) => memory.request);   // reads the frozen request

      // Total handler: the last alternative is unguarded (rule 11).
      const busy = [
        { target: exits.GaveUp, guard: ({ memory }) => memory.attempts >= p.maxRetries || deny("RetriesLeft") },
        { target: S.BACKOFF, updateMemory: ({ memory }) => ({ attempts: memory.attempts + 1 }) },
      ];
      const uncertain = { target: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })) };

      return {
        default: S.SENDING,
        start: { actions: [send] },                         // the first send: part of the entering transition
        states: {
          SENDING: {
            on: {
              "save.Done": exits.Done,
              "save.Locked": busy,
              "save.NotSent": busy,                         // never invoked, so a retry is safe
              "save.Rejected": { target: exits.Failed.from(({ event }) => ({ reason: event.reason })) },
              "save.Unknown": uncertain,                    // never retried: a double write
              "save.Interrupted": uncertain,                // may have been invoked (H5)
              "save.Defected": uncertain,
            },
          },
          BACKOFF: {
            schedules: { retry: { schedule: p.backoff, send: E.Retry } },
            on: { Retry: { target: S.SENDING, actions: [send] } },   // sends memory.request, never live values
          },
        },
      };
    },
  );
```

```ts
// ticket-editor.definition.ts
const DeleteRequest = Schema.Struct({ ticketId: Schema.String });
const LateOutcome = Schema.Struct({
  outcome: Schema.Literals(["success", "failure", "notSent", "unknown", "interrupt", "defect"]),
  attempt: Schema.NullOr(Attempt),
});

export const TicketEditor = definition({
  id: "Desk/TicketEditor",
  states: [
    "VIEWING",
    { DELETE_ASK: Confirm },
    {
      DELETING: {
        fragment: CommitWithRetry({ request: DeleteRequest, maxRetries: 3, backoff: "2 seconds" }),
        // reads the staged snapshot: memory after the entering transition's updateMemory (rule 4)
        input: ({ memory }) => ({ request: { ticketId: memory.ticketId } }),
      },
    },
    "DELETED",
    "UNCERTAIN",
  ],
  events: { Delete: {}, CancelDelete: {}, Dismiss: {}, Reconcile: {} },
  input: { ticketId: Schema.String },
  memory: {
    ticketId: Schema.String,
    error: Schema.NullOr(Schema.String),
    attempt: Schema.NullOr(Attempt),
    pendingAttempt: Schema.NullOr(Attempt),     // set in the departure turn (L7)
    late: Schema.NullOr(LateOutcome),            // set when an abandoned commit settles
  },
  initial: ({ input }) => ({ ticketId: input.ticketId, error: null, attempt: null, pendingAttempt: null, late: null }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-editor.machine.ts
export const TicketEditorMachine = machine(TicketEditor, ({ S, O }) => ({
  default: S.VIEWING,
  on: {
    // Reconciliation is an explicit host event, never a handler that moves the actor (E5).
    Reconcile: [
      {
        target: S.DELETED,
        guard: ({ memory }) => memory.late?.outcome === "success" || deny("NotLanded"),
        updateMemory: () => ({ late: null }),
      },
      {
        target: S.UNCERTAIN,
        guard: ({ memory }) =>
          (memory.late !== null && ["unknown", "interrupt", "defect"].includes(memory.late.outcome)) || deny("Settled"),
        updateMemory: ({ memory }) => ({ attempt: memory.late?.attempt ?? null, late: null }),
      },
      { target: "self", updateMemory: () => ({ late: null }) },   // failure or notSent: nothing landed
    ],
  },
  states: {
    VIEWING: {
      on: {
        // a second delete cannot start while an abandoned one is unsettled (L7), nor before it is reconciled
        Delete: {
          target: S.DELETE_ASK,
          guard: ({ memory }) => (memory.pendingAttempt === null && memory.late === null) || deny("DeletePending"),
        },
      },
    },
    DELETE_ASK: {
      exits: { Confirmed: S.DELETING, Declined: S.VIEWING },      // entering DELETING runs its `start`
    },
    DELETING: {
      props: {
        // The host owns the operation, its cache policy and its own error tags. `R` is the fragment's results.
        save: ({ R }) =>
          O.Tickets.delete.commit(({ payload }) => ({ ticketId: payload.ticketId }), {
            outcomes: {
              success: R.Done,                                                // only a success result is accepted here
              failure: {
                TicketLocked: R.Locked,                                       // only failure results are accepted here
                NotFound: R.Done,                                             // already gone: counts as done
                Forbidden: R.Rejected.from((error) => ({ reason: error.message })),
              },
              // NotSent, Unknown, Interrupted, Defected cannot be mapped here (type error): Flow delivers them
            },
            // Required: this placement is a step, so it can be left with the commit in flight.
            // Neither handler may target (E5). `pending` runs in the departure turn; `settled` when it settles.
            abandoned: {
              pending: { updateMemory: ({ payload }) => ({ pendingAttempt: payload.attempt }) },
              settled: { updateMemory: ({ payload }) => ({ pendingAttempt: null, late: payload }) },
            },
          }),
      },
      exits: {
        Done: S.DELETED,
        GaveUp: { target: S.VIEWING, updateMemory: () => ({ error: "Ticket stayed locked" }) },
        Failed: { target: S.VIEWING, updateMemory: ({ payload }) => ({ error: payload.reason }) },
        Uncertain: { target: S.UNCERTAIN, updateMemory: ({ payload }) => ({ attempt: payload.attempt }) },
      },
      on: { CancelDelete: S.VIEWING },     // always possible; the commit in flight reports to `abandoned`
    },
    DELETED: {},
    UNCERTAIN: { on: { Dismiss: S.VIEWING } },    // reconciling the unknown write (O.x.retry) is the host's business
  },
}));
```

```tsx
// TicketEditorView.tsx
const editor = useActor(TicketEditorMachine, { input: { ticketId: "t-1" } });
const waiting = useView(editor, (s) => TicketEditor.S.DELETING.BACKOFF.is(s));
const attempts = useView(editor, (s) => s.memory.DELETING?.attempts);   // present only while DELETING
const late = useView(editor, (s) => s.memory.late);
<button onClick={() => editor.send(TicketEditor.E.Delete())}>Delete</button>;
<button onClick={() => editor.send(TicketEditor.E.DELETE_ASK.Yes())}>Yes</button>;
waiting && <button onClick={() => editor.send(TicketEditor.E.CancelDelete())}>Stop retrying ({attempts})</button>;
late && <button onClick={() => editor.send(TicketEditor.E.Reconcile())}>The earlier delete finished: review</button>;
```

### 4.5 Poll until the host leaves (a step with states, no exits)

Fixes: L4, L1, L2, D1 (`stale` is the fragment's own memory). States make one outstanding call by
construction: `REFRESHING` waits for the reply and `WAITING` arms the next tick, so ticks never
stack. A read has no external effect, so it is fenced without an `abandoned` route.

```ts
// fragments.ts
export const Poll = <Q, QI, A, AI>(p: {
  query: Schema.Schema<Q, QI>;
  value: Schema.Schema<A, AI>;
  every: Duration.Input;
}) =>
  fragment(
    {
      id: "Poll",
      input: { query: p.query },                             // fixed for the stay; change it by re-entering
      states: ["REFRESHING", "WAITING"],
      internalEvents: { Tick: {} },
      memory: { query: p.query, latest: Schema.NullOr(p.value), misses: Schema.Int, stale: Schema.Boolean },
      initial: ({ input }) => ({ query: input.query, latest: null, misses: 0, stale: false }),
      props: {
        staleAfter: prop<number>({ fallback: 3 }),           // live, optional with a fallback
        // creates fetch.Got, fetch.Unavailable and the reserved fetch.Interrupted, fetch.Defected
        fetch: request.read({ input: p.query, success: { Got: { value: p.value } }, failure: { Unavailable: {} } }),
      },
    },
    ({ S, E, props }) => {
      const fetch = props.fetch.send(({ memory }) => memory.query);
      const missed = {                                       // total: unguarded
        target: S.WAITING,
        updateMemory: ({ memory, props }) => ({
          misses: memory.misses + 1,
          stale: memory.misses + 1 >= props.staleAfter,
        }),
      };
      return {
        default: S.REFRESHING,
        start: { actions: [fetch] },                         // the first fetch rides the entering transition
        states: {
          REFRESHING: {
            on: {
              "fetch.Got": {
                target: S.WAITING,
                updateMemory: ({ event }) => ({ latest: event.value, misses: 0, stale: false }),
              },
              "fetch.Unavailable": missed,
              "fetch.Interrupted": missed,                   // includes a read pending at restore
              "fetch.Defected": missed,
            },
          },
          WAITING: {
            schedules: { tick: { schedule: p.every, send: E.Tick } },   // arms on entry; one firing
            on: { Tick: { target: S.REFRESHING, actions: [fetch] } },
          },
        },
      };
    },
  );
```

```ts
// order-watch.definition.ts
export const OrderWatch = definition({
  id: "Shop/OrderWatch",
  states: [
    "IDLE",
    {
      WATCHING: {
        fragment: Poll({ query: Schema.Struct({ orderId: Schema.String }), value: OrderStatus, every: "5 seconds" }),
        input: ({ memory }) => ({ query: { orderId: memory.orderId } }),
      },
    },
  ],
  events: { Watch: {}, Stop: {} },
  input: { orderId: Schema.String },
  memory: { orderId: Schema.String },
  initial: ({ input }) => ({ orderId: input.orderId }),
  operations: { Orders: OrdersDomain },
});
```

```ts
// order-watch.machine.ts
export const OrderWatchMachine = machine(OrderWatch, ({ S, O }) => ({
  default: S.IDLE,                                           // Poll has `start`, so it is not the default path
  states: {
    IDLE: { on: { Watch: S.WATCHING } },
    WATCHING: {
      props: {                                               // staleAfter omitted: its fallback applies
        fetch: ({ R }) =>
          O.Orders.status.refetch(({ payload }) => payload, {
            outcomes: { success: R.Got.from((value) => ({ value })), failure: { Unavailable: R.Unavailable } },
          }),
      },
      on: { Stop: S.IDLE },        // the only way out: timers stop, a late read is fenced and recorded
    },
  },
}));
```

```tsx
// OrderWatchView.tsx
const watch = useActor(OrderWatchMachine, { input: { orderId: "o-9" } });
const latest = useView(watch, (s) => s.memory.WATCHING?.latest ?? null);
const stale = useView(watch, (s) => s.memory.WATCHING?.stale ?? false);   // the fragment's own flag
<button onClick={() => watch.send(OrderWatch.E.Watch())}>Watch</button>;
<button onClick={() => watch.send(OrderWatch.E.Stop())}>Stop</button>;
```

### 4.6 AutoSave (a part with a request)

Fixes: D3 (by pattern), D2. Dirty is `edits > savedEdits`; `edits` moves only on `Edited`, raised
from a user event. A changed server value never moves it. `restartOn` watches `edits` and
`inFlight`, so clearing `inFlight` re-arms the timer and a trailing edit is saved after the reply.
Any failure (`Rejected`, `NotSent`, `Unknown`, `Interrupted`, `Defected`) stops saving until the
next edit, so a persistent error does not loop. The save is an idempotent overwrite, so dropping
the Attempt after `Unknown` is safe here; check 10 stops at the next user event, which is the only
way another save starts. The request carries its own key (`noteId`), because the host select reads
only `payload`. As a root part it is never abandoned; placed inside a step it would need an
`abandoned` binding.

```ts
// fragments.ts
export const AutoSave = <V, VI>(p: { value: Schema.Schema<V, VI>; wait: Duration.Input }) =>
  fragment(
    {
      id: "AutoSave",
      hostEvents: { Edited: {} },
      internalEvents: { Due: {} },
      memory: {
        edits: Schema.Int,
        savedEdits: Schema.Int,
        inFlight: Schema.NullOr(Schema.Int),
        failed: Schema.Boolean,
      },
      initial: () => ({ edits: 0, savedEdits: 0, inFlight: null, failed: false }),
      props: {
        current: prop<V>(),                                  // the whole request, key included, read when Due fires
        save: request.commit({ input: p.value, success: { Saved: {} }, failure: { Rejected: {} } }),
      },
    },
    ({ E, props }) => {
      const save = props.save.send(({ props }) => props.current);
      const failed = { target: "self", updateMemory: () => ({ inFlight: null, failed: true }) };
      return {
        schedules: {
          due: {
            schedule: p.wait,
            send: E.Due,
            restartOn: ({ memory }) => `${memory.edits}:${memory.inFlight ?? "-"}`,
          },
        },
        on: {
          Edited: { target: "self", updateMemory: ({ memory }) => ({ edits: memory.edits + 1, failed: false }) },
          Due: [
            {
              target: "self",
              guard: ({ memory }) =>
                (memory.inFlight === null && memory.edits > memory.savedEdits && !memory.failed) || deny("Clean"),
              updateMemory: ({ memory }) => ({ inFlight: memory.edits }),
              actions: [save],
            },
            { target: "self" },
          ],
          "save.Saved": {
            target: "self",
            updateMemory: ({ memory }) => ({ savedEdits: memory.inFlight ?? memory.savedEdits, inFlight: null }),
          },
          "save.Rejected": failed,
          "save.NotSent": failed,
          "save.Unknown": failed,
          "save.Interrupted": failed,
          "save.Defected": failed,
        },
      };
    },
  );
```

```ts
// note-editor.definition.ts
const SaveNote = Schema.Struct({ noteId: Schema.String, body: Schema.String });

export const NoteEditor = definition({
  id: "Notes/NoteEditor",
  states: ["EDITING"],
  parts: { autosave: AutoSave({ value: SaveNote, wait: "1 second" }) },
  events: { Type: { body: Schema.String } },
  input: { noteId: Schema.String, body: Schema.String },
  memory: { noteId: Schema.String, draft: Schema.String },
  initial: ({ input }) => ({ noteId: input.noteId, draft: input.body }),
  operations: { Notes: NotesDomain },
});
```

```ts
// note-editor.machine.ts
export const NoteEditorMachine = machine(NoteEditor, ({ S, E, O }) => ({
  default: S.EDITING,
  parts: {
    autosave: {
      props: {
        current: ({ memory }) => ({ noteId: memory.noteId, body: memory.draft }),   // a draft, not server data
        save: ({ R }) =>
          O.Notes.save.commit(({ payload }) => payload, {
            outcomes: { success: R.Saved, failure: { Rejected: R.Rejected } },
          }),
      },
    },
  },
  on: {
    // server normalisation writes the cache, never `draft`, never `Edited`: no loop
    Type: { target: "self", updateMemory: ({ event }) => ({ draft: event.body }), raise: [E.autosave.Edited] },
  },
  states: { EDITING: {} },
}));
```

```tsx
// NoteEditorView.tsx
const note = useActor(NoteEditorMachine, { input: { noteId: "n-1", body: "" } });
const dirty = useView(note, (s) => s.memory.autosave.edits > s.memory.autosave.savedEdits);
const failed = useView(note, (s) => s.memory.autosave.failed);
<textarea onChange={(e) => note.send(NoteEditor.E.Type({ body: e.target.value }))} />;
```

### 4.7 Checkout wizard: two nested levels

Checkout, then AddressStep (a step), then two TextField parts. Shows `input` through levels, public
events at the full path through two levels with no listing, a guard passed down, exits with payload
including the draft on `Back` (D7), and fresh-on-re-entry (L3).

```ts
// fragments.ts
export const AddressStep = fragment(
  {
    id: "AddressStep",
    input: { line1: Schema.String, city: Schema.String },
    events: { Continue: {}, Back: {} },                      // public; the fields' Set and Blur are public too
    parts: {
      line1: { fragment: TextField({ validate: required }), input: ({ input }) => ({ start: input.line1 }) },
      city: { fragment: TextField({ validate: required }), input: ({ input }) => ({ start: input.city }) },
    },
    memory: { attempted: Schema.Boolean },
    initial: () => ({ attempted: false }),
    props: { canEdit: guard() },
    exits: {
      Completed: { line1: Schema.String, city: Schema.String },
      Back: { line1: Schema.String, city: Schema.String },   // the draft leaves with the step (D7)
    },
  },
  ({ props, exits }) => ({
    parts: {
      // AddressStep supplies its parts' props; Checkout sees only AddressStep's contract
      line1: { props: { canEdit: props.canEdit } },
      city: { props: { canEdit: props.canEdit } },
    },
    on: {
      Continue: [
        {
          guard: ({ memory }) => (memory.line1.error === null && memory.city.error === null) || deny("Invalid"),
          target: exits.Completed.from(({ memory }) => ({ line1: memory.line1.value, city: memory.city.value })),
        },
        { target: "self", updateMemory: () => ({ attempted: true }) },   // show errors after a failed attempt
      ],
      Back: { target: exits.Back.from(({ memory }) => ({ line1: memory.line1.value, city: memory.city.value })) },
    },
  }),
);
```

```ts
// checkout.definition.ts
export const Checkout = definition({
  id: "Shop/Checkout",
  states: [
    "CART",
    {
      ADDRESS: {
        fragment: AddressStep,
        input: ({ memory }) => ({ line1: memory.address.line1, city: memory.address.city }),
      },
    },
    "PAYMENT",
    "PLACED",
  ],
  events: { Begin: {}, Pay: {}, EditAddress: {} },
  memory: {
    address: Schema.Struct({ line1: Schema.String, city: Schema.String }),   // last entered address
    locked: Schema.Boolean,
  },
  initial: () => ({ address: { line1: "", city: "" }, locked: false }),
});
```

```ts
// checkout.machine.ts
export const CheckoutMachine = machine(Checkout, ({ S }) => ({
  default: S.CART,
  states: {
    CART: { on: { Begin: S.ADDRESS } },
    ADDRESS: {
      props: { canEdit: ({ memory }) => !memory.locked || deny("Locked") },
      exits: {
        Completed: { target: S.PAYMENT, updateMemory: ({ payload }) => ({ address: payload }) },
        Back: { target: S.CART, updateMemory: ({ payload }) => ({ address: payload }) },
      },
    },
    PAYMENT: { on: { Pay: S.PLACED, EditAddress: S.ADDRESS } },   // re-entry: fresh fields seeded from memory.address
    PLACED: {},
  },
}));
```

```tsx
// CheckoutView.tsx
const checkout = useActor(CheckoutMachine);
const city = useView(checkout, (s) => s.memory.ADDRESS?.city);             // { value, error, touched } or undefined
const attempted = useView(checkout, (s) => s.memory.ADDRESS?.attempted);
<input
  value={city?.value ?? ""}
  onChange={(e) => checkout.send(Checkout.E.ADDRESS.city.Set({ value: e.target.value }))}   // same path as the read
  onBlur={() => checkout.send(Checkout.E.ADDRESS.city.Blur())}
/>;
(attempted || city?.touched) && city?.error;
<button onClick={() => checkout.send(Checkout.E.ADDRESS.Continue())}>Continue</button>;
// checkout.send(Checkout.E.ADDRESS.city.Reset())   // type error: no such public event
```

### 4.8 Keywords

| Kind                  | Words (with the prior art each borrows from)                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New                   | `fragment` (React component/hook, TCA reducer); `parts` (UML composite-structure parts); `hostEvents` (opus-split); `start` (UML initial-transition effect); `exits`, `exits.X`, `.from` accessor (UML exit points, XState final `output`); `props`, `prop`, `callback`, `guard()`, `fallback` (React props, Angular `input.required`/`output`); `request.commit`, `request.read`, `.send(select)`, `R`, `abandoned` with `pending`/`settled` (XState `setup` actors, Effect tag mapping, codex abandoned route, codex-split pending); reserved result events `NotSent`, `Unknown`, `Interrupted`, `Defected` (opus-split); `raise` (SCXML raise, as fusion); `payload`; Story: `story.fragment`, `request.fixture`, `enter`, `leave`, `expectExit`, `expectCallback`, `restore` |
| Existing in the plans | `definition`, `machine`, `states`, `events` (now also inside fragments, same meaning: public), `internalEvents`, `memory`, `initial`, `input`, `operations`, `default`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `deny`, `outcomes` (host option: `success`/`failure`), `success`/`failure` (request declaration fields), `Attempt`, `"self"`, `.is`, `S`, `E`, `O` |
| Author-chosen         | every other name (`Debounce`, `query`, `ARCHIVE_ASK`, `onSettled`, `canEdit`, `Done`, `GaveUp`, `line1`, ...)                                                                                                                                                                                                                                                                                                      |

Count: about 27 new spellings (was about 33): 15 framework fields and helpers, 4 reserved events,
`payload`, and 7 Story terms. Removed in round 2: `expose`, `accepts`, `unrefusable`, `ignore`, the
fragment-side outcome table. Added: `hostEvents`, reserved event names, `abandoned.pending`.

## 5. Rules

14 numbered rules (was about 25 effective). Sub-bullets elaborate; they are not extra rules.

1. **Shape.** A config that declares `exits` (even `{}`) or `states` is a step, placed in `states`;
   any other fragment is a part, placed in `parts`. `start` is legal only in a step. The types and
   `flow check` refuse the other placement.
2. **Lifetime is the container's.** Step: memory fresh from `initial(input)` on every entry,
   schedules stop on leaving, results from an earlier entry are fenced (reads dropped and
   recorded; commits go to `abandoned`, rule 13). Part: memory starts once.
3. **Entry always starts at `default` and runs `start`.** Only the state can be targeted from
   outside, never an inner state. `start` is the step's initial transition: its actions are appended
   to every accepted transition that enters the placement and read the fresh `initial` memory.
   Restore, hydration, admission and `"self"` do not run it.
4. **One snapshot rule per kind of read.** Guards, `updateMemory`, action parameters and raised
   handlers read the pre-turn snapshot (Machines O3 unchanged). A placement's `input` function reads
   the **staged host memory**: pre-turn memory plus the entering handler's (or exit mapping's)
   `updateMemory`, and `context`; raised parts' patches are not included, and `event` is not
   readable. This is the one amendment to Machines O3, with precedent in activity `params`
   (Machines O6). Data from an event or exit payload reaches `input` through that handler's
   `updateMemory`.
5. **Default path.** A step with `start` cannot be on the host's default path (root or compound
   defaults): admission runs no `start`. A step with `input` but no `start` may be; its `input`
   reads initial memory.
6. **Props.** Supplied in the machine beside the placement; all required. A value prop may declare
   `fallback`; a callback the host ignores is bound to `{}`; guards have no optional form. A host
   cannot supply an undeclared prop. A fragment that places fragments supplies their props itself
   and may pass its own through.
7. **Who sends.** A fragment's `events` are public: the UI (or anyone) sends them at the full path
   through any nesting. `hostEvents` are raisable only by the container. `internalEvents` are sent
   only by the fragment's schedules and Flow-delivered results. Anything the fragment needs always
   delivered must be public, because no host code is then between the sender and the fragment (E4).
   Everyone may read any fragment's memory and states; nobody outside writes them.
8. **One rule for callbacks and exits.** A callback handler may act and update host memory; it never
   leaves its container: for a part of the host root the container is the host, so it may target
   any host state; for a part inside a step it may target only states of that step; for a step it
   may not target at all. Only the fragment takes `exits.X`; the host maps every exit on the
   placement state, exhaustively. Host leaving is not an exit.
9. **Leaving from outside** is a plain ancestor handler on the placement state. Inner handlers go
   first; the fragment cannot veto.
10. **`raise` is fusion over the pre-turn snapshot.** It targets `hostEvents` only, and only from
    handlers of the container's own public events (never from a reply, exit mapping or timer
    handler). It composes the host handler with the target's handler as resolved against the
    pre-turn snapshot:

    | Aspect       | Rule                                                                                                                                                        |
    | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Guards       | every composed handler's guard must pass; otherwise the whole event is denied and `check()` reports each declined code, host first                           |
    | Unhandled    | a raised event the target's active leaf and ancestors do not handle denies the whole event (`deny("Unhandled")`); `flow check` warns if a reachable leaf does not handle it |
    | Memory       | patches are disjoint (each fragment owns its slice); host patch first                                                                                         |
    | Actions      | host actions, then raised handlers' actions in `raise` order                                                                                                  |
    | State change | at most one: `"self"` is not a state change; the host's target, an inner state of a raised step and a raised exit each count; `flow check` errors on a provable second, a whole-turn rejection with an issue otherwise |
    | Nesting      | a raised handler may raise into its own parts' `hostEvents`; raise goes only downward                                                                         |
    | Not active   | raising into a step entered in the same turn, or a part absent before the turn, is an error                                                                    |
11. **Terminal deliveries are total.** A handler of a result event, a reserved event, a timer event
    or an exit mapping must end in an unguarded alternative and may not `raise`, so a reply, exit or
    timer firing is never consumed by a declined turn.
12. **Requests.** A `request` prop declares a kind (`commit` or `read`), a Schema `input`, one
    `success` result and named `failure` results.
    - **Division.** The host binding maps the operation's `success` onto the success result and each
      failure tag onto a failure result (kinds checked, so `success: R.Locked` and
      `failure: { X: R.Done }` are type errors), using `outcomes`. It cannot map `NotSent`,
      `Unknown`, `Interrupted` or `Defected` (H4, H5). Flow delivers those to the fragment as
      reserved events; commits carry the `Attempt` on all but `NotSent`.
    - **Replies exist only for admitted calls (L8).** `NotSent` answers a call Flow declined
      (`concurrency: "reject"`, pre-invocation cancel, failed acknowledgment) and is delivered to
      exactly that call. A call rejected by the one-outstanding rule below produces no event: the
      turn is rejected.
    - **Select reads `payload`** on the host side, so a retry sends exactly what the fragment sent
      (D2). The fragment-side select may read memory and props. The request `input` carries every
      key the operation needs.
    - **One outstanding call per request prop**, by construction in the examples. A `send` while one
      is outstanding rejects the turn like an invalid action (Machines O3).
    - **Projection defects end the call.** If a host mapper (`R.X.from(fn)`) throws, the call ends
      with `Defected` (with the Attempt for a commit) and an issue, instead of waiting forever.
13. **Abandonment.** A commit binding must declare `abandoned` whenever its owner can be removed:
    the request's placement is a step or is inside one (the root parts of a host are exempt:
    disposal ends the actor). `abandoned = { pending, settled }`, each a non-targeting handler
    (`updateMemory`, `actions`) receiving `payload = { outcome, attempt }`.
    - `pending` runs fused into the departure turn, whichever handler leaves, if the pre-turn
      snapshot shows an outstanding call: the host records the Attempt synchronously (L7).
    - `settled` runs in a later turn when the call settles with any of success, failure, `notSent`,
      `unknown`, `interrupt`, `defect`. It never targets; the host reconciles through an explicit
      host event (E5). Reads are never abandoned: a fenced read has no external effect.
    - Restore: the placement generation is persisted. An acknowledged commit restores as `Unknown`
      to its fragment, or to `settled` if the placement is gone; a pending read restores as
      `Interrupted`; neither restore nor hydration runs `start`.
14. **Fragments do no I/O and choose no operation.** The host owns keys, `writes`, `optimistic`,
    concurrency and its error tags; the fragment owns what each result means for it. Instance name =
    placement key; collisions with host names are errors.

## 6. Testing a fragment alone

`story.fragment(fragment, options)` generates the host (the shape is derived from the config).
It uses the Story infrastructure: controlled clock, fixtures as Layers, outcomes from real
services and never injected (Testing O3). For a request prop, `request.fixture(layer)` binds a
generated operation backed by the Layer; the generated host maps the fixture's success to the
declared success result and each fixture failure tag to the failure result of the same name, so a
fixture's tags must equal the declared names.

```ts
const run = story
  .fragment(CommitWithRetry({ request: DeleteRequest, maxRetries: 2, backoff: "2 seconds" }), {
    id: "CommitWithRetry/locked-twice",
    input: { request: { ticketId: "t-1" } },
    props: {
      save: request.fixture(LockedTwiceThenOk),            // Layer-backed; outcomes arrive through real services
    },
  })
  .enter()                                                 // runs `start` (a step)
  .process()
  .advance("2 seconds").process()
  .checkpoint("after-first-retry")
  .advance("2 seconds").process()
  .expectExit("GaveUp")                                    // the generated host maps every exit to a leaf
  .run();
```

- **Props:** value props are constants or a table keyed by checkpoint (no arbitrary callbacks, per
  Testing O1); guards are `"allow"` or `deny("Code")`; callbacks are recorded with payloads and may
  be `{}`; requests bind to fixtures.
- **Commands:** `enter`, `leave` (asserts timers stop; a read outcome is fenced; a commit in flight
  reaches `pending` in the departure turn and later `settled`), `send` (public events; hostEvents
  through a generated raise), `process`, `advance`, `advanceTo`, `checkpoint`, `expectExit`,
  `expectCallback`, `restore`.
- **Cases the fixtures cover:** never sends (`advance` far past every deadline); host refuses
  (deny guards; public events still arrive); leave mid-flight, then a second `enter`; `reject`
  concurrency yields `NotSent` and retry; adapter interrupt after invocation yields `Uncertain`;
  restore mid-flight; a throwing mapper yields `Defected`.
- A host still needs integration Stories for wiring, permissions and persistence.

## 7. Against the problems

The first 21 are from [principles.md](../principles.md). The next 14 are the round 1 and round 2
additions. "Prevents" means enforced by types or `flow check`; otherwise the row says "by
convention" or "allows".

| #   | Verdict                                  | One sentence                                                                                                                                                                                       |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | prevents (step); allows by design (part) | Step schedules stop on leaving by construction; a part's timers live with the host, as its placement key says.                                                                                      |
| L2  | prevents                                 | Outcomes carry the placement generation: stale reads are dropped and recorded, stale commits go to the required `abandoned` route, and cache writes still apply.                                    |
| L3  | prevents (step); allows by design (part) | Step memory is fresh from `initial(input)` on each entry; a part keeps its memory for the container's life.                                                                                         |
| L4  | prevents                                 | Leaving is a plain ancestor handler, and `flow check` errors (exact) when a step has no reachable exit and no leaving transition.                                                                    |
| E1  | prevents                                 | The host reaches only declared props and guards; refusals exist only where the fragment wrote `guard: props.x`; leaving abandons the whole fragment.                                                 |
| E2  | allows                                   | Public `events` of an inner fragment are public at the full path through every middle layer, so renaming `Set` breaks UI code at that path; the path is part of each layer's contract.               |
| E3  | prevents                                 | A step ends only through `exits` written in it, and a callback handler never leaves its container (type error, check 1).                                                                              |
| H1  | allows, by the fragment author's choice  | A fragment that needs host policy before a change declares it `hostEvents` and the host raises it under its own guard; a public event bypasses host policy by design.                              |
| H2  | allows                                   | A host cannot add a check the fragment did not declare (change the fragment), but it can guard its own events, leaving transitions and `hostEvents` raises.                                         |
| H3  | prevents                                 | Nobody sends an exit or an internal event; the host maps only kind-correct results and never the reserved kinds.                                                                                     |
| D1  | prevents (reads); callbacks allow copies | Fragment memory is readable, so hosts keep no copies; a callback handler that copies into host memory can drift, and the examples read the fragment instead (Poll `stale`).                        |
| D2  | prevents                                 | `input` is frozen into fragment memory at entry; fragment sends read `memory.request`; the host select reads only `payload`; retry only on `NotSent` and declared failures.                         |
| D3  | allows; pattern only                     | The AutoSave counter, flag and flush pattern avoids the loop, but nothing enforces it; `flow check` reports only unguarded request cycles (check 11).                                               |
| D4  | prevents (host); check (fragment)        | Host `outcomes` must cover the operation's success and failure tags with kind-correct results (types); the fragment's handling of every result and reserved event is check 8 (exact), not a type error. |
| A1  | prevents                                 | Nothing is listed or forwarded per level; public events are sent at the path they are read; props passed down cost one line each.                                                                   |
| A2  | partly allows                            | `input` is in the definition, `props` and `exits` in the machine, all keyed by the placement name; `flow graph` prints each placement's contract as one panel.                                       |
| A3  | prevents                                 | Rule 1 decides the shape from the config; no placement is optional; one rule (8) covers callbacks and exits.                                                                                         |
| A4  | prevents                                 | `fragment`, `parts`, `hostEvents`, `request`, `start`, `exits` are unused in the plans; fragment `events` now means the same as root `events` (public).                                              |
| A5  | prevents                                 | The host picks the operation, keys, writes and error tags; the fragment starts nothing itself and routes results.                                                                                    |
| A6  | prevents                                 | Props are required, silence is spelled `{}` and listed by inspection, exits and outcome mappings are exhaustive, `abandoned` is required at the binding, and `flow check` covers untyped input.    |
| E4  | prevents (by rule)                       | Anything a fragment needs always delivered is a public event with no host code in front of it; a `hostEvents` raise can be refused by the host, so a fragment author must not put an invariant there (convention, not checkable). |
| L5  | prevents                                 | A commit whose owner can be removed must declare `abandoned`; success, failure and unknown reach the host after leaving whichever handler left (types, check 6).                                    |
| L6  | prevents, given an Operations change     | A declined or silently cancelled commit is answered `NotSent` to that call; without that amendment a step would hang, so it is part of the proposal and Story-tested.                              |
| H4  | prevents (host); allows (fragment author) | The host cannot map `Unknown`, `Interrupted`, `Defected` or `NotSent`; the fragment maps them once, and check 10 flags a re-send reachable from an uncertain kind.                                  |
| D5  | prevents, given a Persistence change     | Restore keeps the placement generation; acknowledged commits restore as `Unknown`, pending reads as `Interrupted`; abandoned ones go to `settled`; `start` never runs on restore.                  |
| D6  | prevents                                 | Entry `input` reads the staged host memory after the entering `updateMemory`, so one transition can update memory and enter with the new value.                                                     |
| D7  | allows; by convention                    | An abnormal exit can carry the draft (`Back` in 4.7) and `abandoned` carries the Attempt, but nothing forces a fragment's exits to carry edited fields.                                              |
| T1  | prevents                                 | A denied or unhandled raise denies the whole event and `check()` reports every declined code; raises are barred from reply, exit and timer handlers, so no terminal delivery is lost (rule 11).    |
| T2  | prevents                                 | `restartOn` is idle on entry (Machines O5); raising a trigger into a fragment entered this turn is an error (check 2).                                                                                |
| A7  | prevents                                 | A step's first send is its own `start`, appended to every entering transition; a request that is declared but never sent is a check error (check 9).                                                 |
| L7  | allows; by convention, given a synchronous record | `abandoned.pending` records the Attempt in the departure turn (enforced by the required binding), but refusing a second submit is a host guard (`pendingAttempt === null` in 4.4); check 17 warns when the recorded key is never read. |
| H5  | prevents                                 | `Interrupted` and `Defected` carry the Attempt and are uncertain, never "not sent"; only `NotSent` is retried, and check 10 errors on a re-send reachable from an uncertain kind.                    |
| E5  | prevents                                 | `pending` and `settled` cannot target (type error); reconciliation is an explicit host event.                                                                                                         |
| L8  | prevents                                 | Replies exist only for admitted calls: `NotSent` answers exactly the call Flow declined, and a call rejected by the one-outstanding rule produces no event because the turn is rejected.            |

## 8. `flow check` checks

Run over the compiled graph, where every placement is a node tagged `fragment: { id, instance }`
([CommandLine O5](../../../CommandLine.plan)). **Exact** checks are decided over structure and
types; **heuristic** checks run over opaque guards and selectors and report possibilities. Errors
fail the check; warnings do not.

1. (Error, exact) Mirrors every type error for untyped callers: unbound, undeclared or mistyped
   props; exit and callback payloads; unmapped or doubly mapped exits; step features in a part, or
   a part in `states`; a callback target that leaves its container; name collisions; events outside
   a target's declared inbox; request kind and result-kind mapping, non-exhaustive host `outcomes`,
   host mapping of a reserved kind, host select reading more than `payload`; payloads that do not
   decode or encode for traces.
2. (Error, exact) `raise` composition: a provable second state change; a raise from a reply, exit
   or timer handler; a raise into a step entered in the same turn or a part absent before it.
3. (Error, exact) A handler of a result, reserved, timer or exit event does not end in an unguarded
   alternative (rule 11).
4. (Error, exact) `start` in a part, or a step with `start` on the host's default path; an `input`
   function reads `event`.
5. (Error, exact) A step has no reachable exit and the host has no transition leaving the
   placement or from an ancestor (L4).
6. (Error, exact) A commit binding whose owner can be removed lacks `abandoned`, lacks `pending`,
   or has a targeting handler.
7. (Error, exact) A request is declared but no reachable `start` or handler sends it.
8. (Error, exact) A state that sends a request does not handle every result and reserved event of
   it, or a result event is handled only in states other than where it is sent (stuck wait; D4 on
   the fragment side).
9. (Error, exact) Two placements with the same instance name in one container; state paths over ten
   segments.
10. (Error, exact over the graph, conservative) A path from `Unknown`, `Interrupted` or `Defected`
    reaches a `send` of the same request prop without passing an exit or an external (public-event)
    input. AutoSave passes because the path needs a user `Edited`.
11. (Error, exact) A request cycle through fragment events with no `guard` on any edge. (Info,
    heuristic) The same cycle with guards: a guard may or may not bound it (CommitWithRetry).
12. (Warning, exact) A declared exit no path reaches; an inner state unreachable from `default`; a
    schedule whose `send` event is unhandled; a leaf with no handler and no exit; a `hostEvents`
    event unhandled in a reachable leaf.
13. (Error, exact) A host guard references a fragment state or memory path that does not exist.
14. (Warning, exact) A fragment `input` that no `initial` or part uses.
15. (Warning, heuristic) A second `send` of one request prop reachable before the first settles.
16. (Warning, exact) A step's memory or generation is not persistence-eligible while the host
    persists.
17. (Warning, heuristic) A host memory key written by `abandoned.pending` or `settled` is never
    read by a guard or a transition (the record is not used to reconcile; L7, D7).

What `flow check` cannot prove: that a guard bounds a retry loop, that an autosave pattern avoids a
feedback loop (D3), that a host guard really refuses a second submit while `pendingAttempt` is set
(L7), that an exit carries the edited draft (D7), that a fragment author did not put an invariant in
`hostEvents` (E4), or that a fragment maps `Unknown` to a sensible exit. These are reviewed in the
fragment, once.

Prior-art calibration: SCXML validators and UML tools check well-formedness (unique ids, targets,
connection points); XState checks types plus `@xstate/graph` reachability; model checkers (UPPAAL,
SPIN) check deadlock freedom, which are checks 5, 7 and 8; Angular's template checker rejects
missing required inputs; Rust rejects incomplete trait impls and non-exhaustive `match`; Effect
tracks unprovided requirements. Checks 3, 6, 10 and 17 have no common prior-art tool and are the
new value.

## 9. Adds, removes, weaknesses

**Adds** (relative to [proposal.md](../proposal.md)): `fragment` replaces `trait` and `subroutine`;
the shape is inferred (rule 1); `parts` replaces `embeds`; `hostEvents`; `request.commit` and
`request.read` with kind-correct results, `R`, reserved events, `abandoned.pending/settled`;
`fallback`; `start`; `input` at the placement; fusion semantics for `raise`; terminal totality;
`story.fragment`.

**Removes:** the two constructors; the host mapping outcomes onto internal events; the host
mapping any reserved kind; the optional-callback gap; forwarding every UI event with `raise`
(it remains only for host-owned commands); round 1's `expose`, `accepts`, `unrefusable`, `ignore`
and the fragment-side outcome table.

**Plan changes this needs** (each argued, none silent):

- Machines O1/O2: definition `parts`, state placement, `hostEvents`, fragment `events`, `start`.
- Machines O3: placement `input` reads staged host memory (precedent: activity `params`, Machines
  O6). `start` rides the entering accepted transition, so "finite work starts only from an accepted
  transition's actions" and "no replay on restore, hydration or re-entry" still hold. `abandoned.pending`
  fuses into the departure turn; `abandoned.settled` is a new turn source (non-targeting). A
  throwing host mapper enqueues `Defected` (today a post-commit mapper defect enqueues nothing).
- Operations O2/O3: (a) outcomes of a request-bound commit are fenced by generation, with the
  `abandoned` exception (O2's "its event reaches the later state" is kept only for abandoned
  commits); (b) a declined or pre-invocation-cancelled commit is answered `NotSent`; (c) `interrupt`
  and `defect` of a commit carry the Attempt; (d) request-bound `outcomes` target kind-correct
  results and may not map reserved kinds; (e) outcome members that are optional today are required
  at a request binding.
- Persistence: placement generation in the snapshot; restored pending reads become `Interrupted`;
  an abandoned commit restores into `settled`.
- Testing O1: `story.fragment`. CommandLine O5: the checks above.

**Honest weaknesses**

1. **The shape is inferred, not named.** A reader learns step versus part by scanning for `exits`
   and `states`. A split would name it.
2. **`start` is an entry action in all but name**, restricted to steps and to transitions that
   enter them.
3. **The request design needs five Operations changes** and a new turn source. It is the highest-value
   piece and the most likely to be contested.
4. **The abandoned protocol is boilerplate** for each step commit: two handlers, two memory keys, a
   `Reconcile` event and a guard on the next submit (about 25 lines in 4.4). It is the price of
   never losing an `unknown` and of closing L7 and E5.
5. **L7 is closed only by convention at the second submit.** The record is synchronous and
   mandatory; refusing the second submit is a host guard that `flow check` can only warn about.
6. **Public events at depth (E2).** Renaming an inner fragment's public event breaks UI code at the
   full path, and a middle layer cannot make an inner public event private.
7. **E4 for `hostEvents` is a convention**: the fragment author must put anything invariant-bearing
   in `events`.
8. **Fusion is not free.** A raised handler cannot see the host's updated memory in the same turn;
   one state change per turn can reject a turn at run time where it cannot be proven earlier.
9. **Placement `input` cannot read the event.** Seeding from an event costs a host memory key that
   outlives the step (`ticketId`). A per-edge supply (`S.X.enter`, as in opus-single and codex-split)
   would type each entering event, at the cost of a second form beside the bare `S.X` target;
   kept as placement-level for one canonical form.
10. **Fragment-side exhaustiveness is a check, not a type error** (D4), because the result table was
    dropped in round 2.
11. **Type cost.** Generic fragments (`Poll<Q, A>`, `CommitWithRetry<Req>`), dotted event keys
    (`"save.Done"`) and nested public paths stress inference; the S1 type spike should test them
    first.
12. **D3 and D7 stay conventions.** The checks cannot see feedback loops through server data or
    drafts lost on abnormal exits.

## 10. Possible cuts

Feature cuts the user may decide on. **None is applied.** Ranked by the round 2 simplicity audit,
with the losses it understated corrected by the correctness review (section 8 of
[round2-correctness.md](reviews/round2-correctness.md)). Round 2 already removed two things that
were cuts in the audit: host `expose` (replaced by fragment-declared `events`/`hostEvents`, which
the principles review required) and `unrefusable` (made redundant by public events).

| # | Cut | What it simplifies | Use cases that break | Problems it reopens |
| - | --- | --- | --- | --- |
| 1 | **`request.read`** (reads stay host activities or host-mapped refetches) | About a third of the request rules: read kind, read restore, read select keys | Poll and verify steps owning their refresh reply (4.5) | D4 for reads; **L2 for reads** (a late refresh reply reaches a re-entered step unfenced) and **D5** (a pending read at restore strands `REFRESHING`), both understated by the audit; H3/H4 for reads (host-mapped read outcomes can fake `Got`) |
| 2 | **Live value props** (frozen `input` only) | 1 word, `fallback`, the "live vs frozen" question | Fragments reading changing host values: AutoSave `current`, Poll `staleAfter`, pagination limits | D1: values pushed by `hostEvents` become copies; AutoSave needs a `SetCurrent` host event |
| 3 | **Fragments containing steps** (parts inside steps stay; no step inside a step) | Nested relay, nested `start`, nested generations, nested `abandoned` routing: the deepest rules | Composite steps (a wizard step that itself calls a confirm) | Prior-art D1 (rebuild composites by hand); A1 inside composites. Also removes L5-at-depth, so it is a net correctness gain |
| 4 | **`start`** (the host's entering transition sends first) | 1 word, rules 3 and 5, a Machines O3 exception | Self-contained first sends (4.4, 4.5) | A7; D2 (two places choose the request); **L8** (the host now issues the fragment's request, so one-outstanding spans two owners) |
| 5 | **Forbid leaving a step while a commit is in flight** (flow check error unless the leaving transition cancels or the step is not sending), instead of `abandoned` | The abandoned protocol: rules 13 and part of 12, the handlers, the `Reconcile` boilerplate | Leaving mid-commit without waiting (4.4 `CancelDelete`) | **L4 fully for hung I/O** (an adapter that never settles leaves the actor unleavable; the audit said "partly"); the gain is overstated, because a post-invocation cancel still reports `unknown` with an Attempt after the step is gone, so a route survives. L7 vanishes; L5 becomes a static rule |
| 6 | **Part callback targets** (callbacks never target) | Rule 8's host-root case | Idle timeout to LOCKED, hold to DELETING from a part | Coverage only; workaround is a step. Mild correctness gain (fewer leave paths for L5) |
| 7 | **`raise` fusion** | Rule 10 and its table, rule 11's raise half, T1/T2 machinery | Host feeding a fragment: Debounce (4.1), AutoSave `Edited` (4.6), Replace after save | A1 (UI must send hostEvents directly, so they become public); H1; **D3 understated**: the host could no longer feed a fragment at all; T1 becomes moot only because the feature is gone |
| 8 | **Request ports entirely** (host maps outcomes onto fragment events, as in the round 0 draft) | The largest cut: roughly 8 to 15 words and 10 to 15 rules, most plan amendments | Fragment-owned retries, fenced replies, kind-checked mappings (4.4 to 4.6) | D2, D4, H3, H4, L2, L5, L6, D5, A5, plus **H5 and L8**: outcome meaning moves back into hand-written host mappings |

Best ratios (audit): cuts 1, 2 and 6 are small and contained; cuts 3 and 5 are large wins with
nameable losses and deserve a deliberate decision; cuts 7 and 8 remove the reason fragments exist
and reopen the most problems.

## 11. Revision log (round 2)

Findings are from [round2-correctness.md](reviews/round2-correctness.md) (C),
[round2-principles.md](reviews/round2-principles.md) (P) and
[round2-simplicity.md](reviews/round2-simplicity.md) (S).

| Finding | Action |
| --- | --- |
| C-B1, P5: abandoned routes target and preempt a newer live step (E5) | Fixed. `abandoned.pending`/`settled` are non-targeting; reconciliation is an explicit `Reconcile` host event (4.4, rule 13, check 6). |
| C-7.1 departure gap (L7), codex-split | Adopted. `pending` runs fused into the departure turn with the Attempt; the host records it and guards the next submit. The guard remains a host convention (L7 row says so). |
| C-M1, P: "a part's commit is never abandoned" is false inside steps | Fixed. `abandoned` is required whenever the owner can be removed; root parts are exempt (rule 13, check 6). |
| C-M2: AutoSave fails check 18 | Fixed. Check 10 stops at an external (public-event) input; AutoSave comment explains the idempotent overwrite. |
| C-M3, P: Poll breaks one-outstanding | Fixed. Poll has `REFRESHING`/`WAITING`; the tick arms only after the reply. |
| C-M5 results carry no kind | Fixed. `success` and `failure` declarations; the host's `success` accepts only the success result, `failure` only failure results (rule 12). |
| C-M4 E4 claim for `unrefusable` | Fixed by removal. Public events reach the fragment directly; E4 is "by rule", with the `hostEvents` residue admitted as a convention (weakness 7). |
| H5: `interrupt` treated as not sent (C-7.3) | Fixed. `NotSent` (declined, never invoked) is the only retryable reserved kind; `Interrupted` and `Defected` carry the Attempt and end in `Uncertain` (4.4). Round 1's "answered `interrupt`" for silent admission is replaced by `NotSent`. |
| L8 phantom replies (C-7.3) | Added to the table; replies exist only for admitted calls (rule 12). |
| P gap 1: terminal deliveries under whole-turn decline | Fixed. Rule 11 (total handlers, no raise from reply, exit or timer handlers); raise only from the container's public-event handlers. Adopted codex-split's idea in a simpler form (ban instead of statically-total commands). |
| P gap 2: projection defects | Fixed. A throwing host mapper ends the call with `Defected` (rule 12; Machines O3 note). |
| P-newly-wrong 3 / P gap 3: two snapshot rules, `"self"` | Fixed. Rule 4 states both reads; rule 10 table says `"self"` is not a state change. |
| P-newly-wrong 2 / P gap 5: payload-only select cannot reach the key | Fixed. The request `input` carries the key; AutoSave's `current` returns `{ noteId, body }` (4.6). |
| P: fragment-declared senders instead of `expose` (P-rejection 2, must-fix 5) | Accepted. `expose`, `accepts` and `unrefusable` removed; fragments declare `events` (public) and `hostEvents`. |
| P: placement input should read per edge (P-rejection 1) | Not adopted, with the reason in weakness 9 (one canonical form for `S.X`); the staged snapshot rule is stated precisely. The reviewers' point that seeding from an event costs a host key is accepted. |
| P minors: `start` in config vs build; rule 2 vs 12; part-in-step callback target; `fallback`/`ignore` in no example; `request.fixture` unexplained | Fixed. `start` is not a shape trigger and is written in `build`; rule 2 refers to rule 13; rule 8 gives the container rule; `fallback` used in Poll, `{}` documented; section 6 explains the fixture mapping. |
| S no-loss drops applied | `ignore` to `{}`; `R` kept host-side but the fragment-side `.send` table and the duplicate `internalEvents` removed (results arrive as events named by the request, reserved kinds keep their kinds and are host-unmappable); `start` no longer a shape trigger (`start` in a part is an error); rule 9 folded into rule 8, rule 3 folded into rule 3's `start` statement (exhaustive exit mapping and "entry starts at `default`" are kept); most of `unrefusable` removed; one handler shape for callbacks and exits; one `story.fragment`; one abandoned handler shape with a synchronous `pending`, non-targeting; one callback-target rule; raise only into `hostEvents` (now valid, because public events exist); one optional form (`fallback`, `{}`; guards have none); one terminal-totality rule; type-mirroring checks collapsed into check 1. |
| S cross drops not applied | "Imply empty declarations" needs explicit constructors, which a single constructor does not have (an implied `exits: {}` would turn Poll into a never-left part: L4, L1), so `exits: {}` stays explicit when a step has no states. "Two constructor names" is the split. |
| S/C feature cuts | Not applied; listed with corrected losses in section 10. |
| Counts | New keywords about 27 (was about 33); numbered rules 14 (was about 25 effective, plus the per-section sub-rules); checks 17 (was 26). |

## 12. Revision log (round 1)

Condensed; the full round 1 changes are carried in sections 1 to 9.

| Finding | Action |
| --- | --- |
| P1 blocker: "two copies of Field" false | Accepted; section 1 concedes the split and states the price; `exits: {}` makes the shape explicit. |
| C-B1/B2/B3 | Abandoned route (now non-targeting, round 2), silent admission answered (now `NotSent`), AutoSave trailing edit fixed. |
| C-M1/M2/M7, P3 to P5 | Entry snapshot rule, raise table, restore rule, default-path bar. |
| P2 | Outcome division adopted (host maps success and tags; fragment owns the reserved kinds). |
| Yardstick additions E4, L5, L6, H4, D5, D6, D7, T1, T2, A7 | In the table. |
