# One fragment constructor, explicit boundaries

Status: proposal, not accepted or implemented. This document proposes one `fragment()`
constructor. Examples describe the proposed API, not exports available in the current package.
The [capability plans](../../../../FlowState.plan) remain authoritative until amended.

Recommendation: make a fragment a reusable, owned portion of one machine. Placement determines
its activation scope; its declared contract determines how it can be addressed. Keep commands,
notifications, requests and completion distinct. Unifying their syntax would conceal different
authority and lifetime rules.

## 1. Verdict on assumptions and prior decisions

| Decision | Verdict and reason |
| --- | --- |
| One leaf, no parallel regions, no child actors | **Keep.** Composition expands one machine; it does not create independently progressing state trees. An embedded fragment cannot declare states or exits. |
| Definition/machine split, static structure, deterministic turns, Schema boundaries | **Keep.** Definitions place and expose fragments; machines bind behaviour. Construction resolves all targets and routes. Value callbacks never choose targets or operations. |
| Traits versus subroutines; prior D12–D13 | **Keep the two concepts; use one constructor.** Every contract declares `kind: "embedded"` or `kind: "state"`, and only that placement is legal. Debounce remains embedded even inside a temporary step; Confirm remains a state even with no substates. One shared contract grammar and compiler justify one constructor, not a claim that nesting requires one. The cost is a discriminant and two inferred result types; two wrappers could be more discoverable. |
| Nesting and names; D1–D3 | **Keep nesting; qualify visibility.** Explicitly exported command paths and readable memory paths are interface. Private command paths are not. Preserve the plans' ten-segment state-path limit, rather than promising unlimited depth. |
| Declared callbacks, owned contracts and encapsulation; D4, D6, D9–D10 | **Keep.** A fragment controls its memory, transitions and safe refusal points. The host supplies declared guard policies. It cannot inject a guard on `Release` or intercept an internal timer. |
| Only exits complete; D5, D7 | **Keep, with abandonment distinguished.** A callback cannot leave its emitting fragment's owning node: root-embedded callbacks may move between host states, while state-fragment callbacks cannot escape their placement. Abandoned-result observation is stricter and never targets. Every declared exit is mapped. |
| Two binding locations and no `bind`; D8 | **Keep the locations.** `embeds.name` binds a colocated instance; `states.NAME` binds a state instance. Adding a third registry would duplicate the state tree. |
| Only hosts send, everybody reads; D11 | **Change sending, keep read ownership.** The fragment declares `events` for public senders, `hostEvents` for the immediate owner, and `internalEvents` for its own schedules/raises. There is no whole-subtree exposure switch. Invariant-carrying public inputs cannot be refused by forwarding layers; host-only command admission remains a deliberate contract choice. |
| Arbitrary internal events as async replies | **Drop.** An operation replies through a declared request port with a generation-bound call identity. A normal command cannot impersonate a reply or completion. |
| “Memory holds keys and drafts, never copies” | **Keep its purpose; clarify commands.** A captured request awaiting confirmation is an intentional immutable command value, not a mirror of a cache record. Pending command input and an unreconciled Attempt are legitimate workflow memory. |

The two behavioural kinds are real; the initial argument that a split cannot nest a debounce
was wrong. A single constructor here means one discriminated contract API, not interchangeable
placement. It is modest syntactic consolidation, and it costs readers the `kind` field rather
than teaching them two function names. Its merits must be proved in inference and use-site tests.
“Every rule checked where written” remains an objective with limits: runtime correlation needs
runtime identities, and TypeScript cannot prove arbitrary callbacks pure. Readable nested memory
also deliberately exposes some structure; unrestricted deep reads are not complete information hiding.

Recommendation within this assignment: **one constructor with a required kind and explicit ports**.
It offers no lifecycle advantage over split constructors; the shared grammar is the benefit.
Copying configuration into the host remains rejected because it loses ownership.

## 2. API and complete examples

### 2.1 The surface and its meaning

`fragment(contract, build)` is inert and has one required placement kind. `"embedded"` shares its
containing node; `"state"` occupies a state. One constructor and two refined result types are
retained because the assignment requires the single shape. The proposed two-constructor drop is
not applied; the other confirmed no-loss drops are applied below.

| Declaration | Meaning / canonical form |
| --- | --- |
| `events` | Public inputs at every depth; no host interception or second raise route |
| `hostEvents` | Inputs the immediate owner can raise into the child |
| `internalEvents` | This fragment's schedule inputs, never its containing host's |
| `input` | Fixed activation value; only incoming-edge input can read post-patch parent memory |
| `fragment.prop(Schema)` | Live captured owner value, read in ordinary pre-turn selectors and existing schedule-arm semantics |
| `fragment.callback(fields)` | Same-turn notification, emitted in `notify`, not finite `actions` |
| `fragment.guard()` | Required policy at a safe refusal point declared by the fragment |
| `fragment.request({ operation, input, replies })` | One finite operation with captured input and kind-preserving terminal replies |
| `start: { port: ({ input }) => value }` | First requests derived only from fixed entry input, never a fresh memory snapshot |
| `exits` | Named completion; always used as `{ target: exits.Name.from(mapper) }` |
| machine `abandoned: { operationAlias: handler }` | One non-targeting observer per operation, shared by all its commit/retry bindings |

Empty event/exit/start declarations are implicit; `kind`, not emptiness, determines placement.
Value/notification props are required unless `.optional()` is declared. An absent optional value
is undefined; an absent optional notification is an inspectable no-op. Guards remain required:
there is no silent allow default. Requests and exit mappings remain exhaustive. Every callback
binding stays within its emitter's owning node; a root embedded callback may target another host
state, while a state fragment's callback cannot escape its placement. Observer handlers are
stricter: no target, guard, raise, notify or actor-self send.

An incoming state `input` mapper reads post-patch parent memory and event/exit payload. After that,
all initialization uses that **fixed value**: `initial({ input })`, embedded child input selectors
`({ input })`, and `start.port({ input })`. No initializer/start sees a different memory snapshot.
A fragment can consume input solely to initialize children without inventing a local memory copy;
this is an explicit fragment-only extension to Machines O1. Ordinary update/action/notify/raise
selectors all read pre-turn memory. Poll below demonstrates retained live props and lookup requests.

Request success/failure variants use Schema field records. Commit/retry standard variants are
`unknown`, `interrupt`, `defect`, and **`notSent`**, all carrying `{ attempt: Attempt }`. `notSent`
guarantees that this admitted call did not invoke the adapter; interrupt/defect do not. Read
interrupt/defect carry `{}` and reads have no unknown/notSent. Host code maps only success and
its exhaustive actual error tags. Standard kinds are compiler-owned and cannot be relabelled Busy.
`reject` concurrency is forbidden for a request binding: an unadmitted call gets no phantom reply.

Private replies are ordinary `on` keys, e.g. `"send.Succeeded"`. Notifications and requests carry
`payload` at their binding; received replies use `event`. `.from` always maps one typed source to
payload data: the source is fixed by its production site, as in the existing event mapper API.
It never chooses a target/operation. There is one exit spelling, no separate reply-handler table,
and no per-binding late-event plumbing.

The blocks form one complete TSX module. Components run under a normal FlowProvider whose Layer
includes ExampleTextServer. Application deployment setup is outside the requested fragment,
definition, machine and sending/reading component examples.

```tsx
import { Context, Effect, Equal, Layer, Schema } from "effect";
import {
  Attempt,
  definition,
  deny,
  fragment,
  machine,
  resource,
  transaction,
} from "flow-state";
import { useActor, useView } from "flow-state/react";

const Empty = Schema.Struct({});
const TextRequest = Schema.Struct({ id: Schema.String, value: Schema.String });
const TextReceipt = Schema.Struct({ id: Schema.String, value: Schema.String });

class Busy {
  readonly _tag = "Busy";
}

class Rejected {
  readonly _tag = "Rejected";
  constructor(readonly reason: string) {}
}

class TextServer extends Context.Service<TextServer, {
  readonly save: (request: typeof TextRequest.Type) =>
    Effect.Effect<typeof TextReceipt.Type, Busy | Rejected>;
}>()("Examples/TextServer") {}

const ExampleTextServer = Layer.succeed(TextServer, {
  save: (request) => Effect.gen(function* () {
    if (request.value === "busy") return yield* Effect.fail(new Busy());
    if (request.value === "reject") {
      return yield* Effect.fail(new Rejected("Rejected by the example server"));
    }
    return { id: request.id, value: request.value.trim() };
  }),
});

const SaveText = transaction({
  id: "Examples/SaveText",
  input: TextRequest,
  key: (request) => ({ id: request.id }),
  concurrency: "allow",
  commit: (request) => Effect.flatMap(TextServer, (server) => server.save(request)),
});

const addAttempt = (items: readonly (typeof Attempt.Type)[], attempt: typeof Attempt.Type) =>
  items.some((item) => item.id === attempt.id) ? items : [...items, attempt];

const removeAttempt = (items: readonly (typeof Attempt.Type)[], attemptId: string) =>
  items.filter((item) => item.id !== attemptId);
```

The adapter's `R = TextServer` is preserved to the runtime; fixture Layers can replace it without
injecting replies. `Busy` means **definitively not applied**. Misclassifying an ambiguous remote
write as a domain Busy is an adapter bug, not something this API can infer from the label.

### 2.2 Debounce: idle until an input, once after the last input

No timer fires on initial activation: this is the plans' `restartOn` baseline rule. The sequence
changes only on input, not on the timer firing.

```tsx
const Debounce = (waitMs: number) =>
  fragment(
    {
      id: "Examples/Debounce",
      kind: "embedded",
      hostEvents: { Input: {} },
      internalEvents: { Due: {} },
      memory: { sequence: Schema.Int },
      initial: () => ({ sequence: 0 }),
      props: { onSettled: fragment.callback({}) },
    },
    ({ E, props }) => ({
      schedules: {
        settle: {
          schedule: waitMs,
          send: E.Due,
          restartOn: ({ memory }) => memory.sequence,
        },
      },
      on: {
        Input: {
          target: "self",
          updateMemory: ({ memory }) => ({ sequence: memory.sequence + 1 }),
        },
        Due: { target: "self", notify: [props.onSettled] },
      },
    }),
  );

const DebounceHost = definition({
  id: "Examples/DebounceHost",
  states: ["OPEN", "SETTLED"],
  events: { Input: {} },
  embeds: { settle: Debounce(300) },
  memory: { settledCount: Schema.Int },
  initial: () => ({ settledCount: 0 }),
});

const DebounceMachine = machine(DebounceHost, ({ E, S }) => ({
  default: S.OPEN,
  embeds: {
    settle: {
      props: {
        onSettled: {
          target: S.SETTLED,
          updateMemory: ({ memory }) => ({ settledCount: memory.settledCount + 1 }),
        },
      },
    },
  },
  on: { Input: { target: "self", raise: [E.settle.Input] } },
  states: { OPEN: {}, SETTLED: {} },
}));

export function DebounceDemo() {
  const actor = useActor(DebounceMachine);
  const count = useView(actor, (snapshot) => snapshot.memory.settledCount);
  const state = useView(actor, (snapshot) => snapshot.state);
  return (
    <section>
      <button onClick={() => actor.send(DebounceHost.E.Input())}>Input</button>
      <output>{state}: settled {count} times</output>
    </section>
  );
}
```

Here the host's event is deliberately private forwarding. External code cannot send
`DebounceHost.E.settle.Input`: that token exists for the owner but is absent from the host's
public Event Schema and rejected by `actor.send`. Only changing Debounce’s declaration to a public
`events.Input` would change that authority.

### 2.3 Validated field: one authoritative draft and initial validation

This is a text field, not an attempt at a universal form library. Its validator is a pure domain
function; event and memory representation use Schema. The value and derived error are updated
together at their owner, including initialization. A cross-field business rule belongs to the
enclosing form, not to a misleading field-local `valid` flag.

```tsx
const requiredText = (value: string): string | null =>
  value.trim().length > 0 ? null : "Required";

const TextField = fragment(
  {
    id: "Examples/TextField",
    kind: "embedded",
    input: { start: Schema.String },
    events: { Edit: { value: Schema.String }, Blur: {} },
    memory: {
      value: Schema.String,
      error: Schema.NullOr(Schema.String),
      touched: Schema.Boolean,
    },
    props: {
      canEdit: fragment.guard(),
      onEdited: fragment.callback({ value: Schema.String }).optional(),
    },
    initial: ({ input }) => {
      const value = input.start;
      return { value, error: requiredText(value), touched: false };
    },
  },
  ({ props }) => ({
    on: {
      Edit: {
        target: "self",
        guard: props.canEdit,
        updateMemory: ({ event }) => ({
          value: event.value,
          error: requiredText(event.value),
        }),
        notify: [props.onEdited.from(({ event }) => ({ value: event.value }))],
      },
      Blur: { target: "self", updateMemory: () => ({ touched: true }) },
    },
  }),
);

const FieldHost = definition({
  id: "Examples/FieldHost",
  states: ["OPEN"],
  events: { ToggleLock: {} },
  embeds: { title: TextField },
  memory: { locked: Schema.Boolean },
  initial: () => ({ locked: false }),
});

const FieldMachine = machine(FieldHost, ({ S }) => ({
  default: S.OPEN,
  embeds: {
    title: {
      input: () => ({ start: "" }),
      props: {
        canEdit: ({ memory }) => !memory.locked || deny("Locked"),
      },
    },
  },
  on: {
    ToggleLock: {
      target: "self",
      updateMemory: ({ memory }) => ({ locked: !memory.locked }),
    },
  },
  states: { OPEN: {} },
}));

export function FieldDemo() {
  const actor = useActor(FieldMachine);
  const value = useView(actor, (snapshot) => snapshot.memory.title.value);
  const error = useView(actor, (snapshot) =>
    snapshot.memory.title.touched ? snapshot.memory.title.error : null,
  );
  const locked = useView(actor, (snapshot) => snapshot.memory.locked);
  return (
    <section>
      <input
        value={value}
        disabled={locked}
        onChange={(event) =>
          actor.send(FieldHost.E.title.Edit({ value: event.currentTarget.value }))
        }
        onBlur={() => actor.send(FieldHost.E.title.Blur())}
      />
      <output>{error}</output>
      <button onClick={() => actor.send(FieldHost.E.ToggleLock())}>
        {locked ? "Unlock" : "Lock"}
      </button>
    </section>
  );
}
```

The guard is part of the field's own transition, so a manually sent exposed `Edit` still checks
the lock. `Blur` is intentionally unconditional. Its seed is required activation input; omitting
`onEdited` is explicitly permitted and listed by inspection. `initial` reads no live prop.

### 2.4 Confirm: return the captured command, not whatever is live later

```tsx
const ConfirmText = fragment(
  {
    id: "Examples/ConfirmText",
    kind: "state",
    input: { request: TextRequest },
    memory: { request: TextRequest },
    initial: ({ input }) => ({ request: input.request }),
    events: { Yes: {}, No: {} },
    exits: { Confirmed: { request: TextRequest }, Declined: {} },
  },
  ({ exits }) => ({
    on: {
      Yes: { target: exits.Confirmed.from(({ memory }) => ({ request: memory.request })) },
      No: { target: exits.Declined },
    },
  }),
);

const ConfirmHost = definition({
  id: "Examples/ConfirmHost",
  states: ["EDITING", { ASK: ConfirmText }, "DONE"],
  events: { Ask: {}, Leave: {} },
  embeds: { title: TextField },
  memory: { confirmedId: Schema.NullOr(Schema.String) },
  initial: () => ({ confirmedId: null }),
});

const ConfirmMachine = machine(ConfirmHost, ({ S }) => ({
  default: S.EDITING,
  embeds: { title: { input: () => ({ start: "" }), props: { canEdit: () => true } } },
  on: { Leave: S.EDITING },
  states: {
    EDITING: {
      on: {
        Ask: {
          target: S.ASK,
          guard: ({ memory }) => memory.title.error === null || deny("InvalidTitle"),
          input: ({ memory }) => ({ request: { id: "document-1", value: memory.title.value } }),
        },
      },
    },
    ASK: {
      exits: {
        Confirmed: {
          target: S.DONE,
          updateMemory: ({ payload }) => ({ confirmedId: payload.request.id }),
        },
        Declined: S.EDITING,
      },
    },
    DONE: {},
  },
}));

export function ConfirmDemo() {
  const actor = useActor(ConfirmMachine);
  const value = useView(actor, (snapshot) => snapshot.memory.title.value);
  const captured = useView(actor, (snapshot) => snapshot.memory.ASK?.request.value);
  const done = useView(actor, (snapshot) => ConfirmHost.S.DONE.is(snapshot));
  return (
    <section>
      <input
        value={value}
        onChange={(event) =>
          actor.send(ConfirmHost.E.title.Edit({ value: event.currentTarget.value }))
        }
      />
      <button onClick={() => actor.send(ConfirmHost.E.Ask())}>Review</button>
      {captured !== undefined && (
        <div>
          <p>Confirm: {captured}</p>
          <button onClick={() => actor.send(ConfirmHost.E.ASK.Yes())}>Yes</button>
          <button onClick={() => actor.send(ConfirmHost.E.ASK.No())}>No</button>
        </div>
      )}
      <button onClick={() => actor.send(ConfirmHost.E.Leave())}>Leave</button>
      <output>{done ? "Confirmed" : "Not confirmed"}</output>
    </section>
  );
}
```

Changing the title while ASK is active does not change the confirmation's request. The UI reads
the captured value being confirmed. `Leave` abandons ASK; it does not fabricate `Declined`.

### 2.5 Commit with retry: first send, typed outcomes and reconciliation

`start` belongs to the fragment and is appended to the accepted transition entering it. It runs
after its input and local memory are initialized, before the one publication. It contains only
request descriptors, not arbitrary entry actions. An input- or start-bearing state fragment is
forbidden on a default path, so admission cannot secretly send a commit.

Replies are handled in `on`. The outcome groups make `unknown → Busy` and `failure → Succeeded`
type errors; system outcomes are not mapped by host code at all. An abandoned observation may
update a host ledger but must never move or raise a transition that moves a newer live step.

```tsx
const SaveReplies = {
  success: { Succeeded: { receipt: TextReceipt } },
  failure: { Busy: {}, Rejected: { reason: Schema.String } },
  unknown: "Uncertain",
  notSent: "NotSent",
  interrupt: "Interrupted",
  defect: "Defected",
};

const CommitWithRetry = (maxRetries: number, backoffMs: number) =>
  fragment(
    {
      id: "Examples/CommitWithRetry",
      kind: "state",
      input: { request: TextRequest },
      memory: { request: TextRequest, retries: Schema.Int },
      initial: ({ input }) => ({ request: input.request, retries: 0 }),
      states: ["SENDING", "BACKOFF"],
      internalEvents: { RetryDue: {} },
      props: {
        send: fragment.request({ operation: "commit", input: TextRequest, replies: SaveReplies }),
      },
      exits: {
        Done: { receipt: TextReceipt },
        Failed: { reason: Schema.String },
        Uncertain: { attempt: Attempt },
      },
    },
    ({ S, E, props, exits }) => ({
      default: S.SENDING,
      start: { send: ({ input }) => input.request },
      states: {
        SENDING: {
          on: {
            "send.Succeeded": { target: exits.Done.from(({ event }) => ({ receipt: event.receipt })) },
            "send.Busy": [
              {
                target: S.BACKOFF,
                guard: ({ memory }) => memory.retries < maxRetries || deny("RetryLimit"),
                updateMemory: ({ memory }) => ({ retries: memory.retries + 1 }),
              },
              { target: exits.Failed.from(() => ({ reason: "Retry limit reached" })) },
            ],
            "send.Rejected": { target: exits.Failed.from(({ event }) => ({ reason: event.reason })) },
            "send.Uncertain": { target: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })) },
            "send.NotSent": { target: exits.Failed.from(() => ({ reason: "Not invoked; safe to review again" })) },
            "send.Interrupted": { target: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })) },
            "send.Defected": { target: exits.Uncertain.from(({ event }) => ({ attempt: event.attempt })) },
          },
        },
        BACKOFF: {
          schedules: { retry: { schedule: backoffMs, send: E.RetryDue } },
          on: {
            RetryDue: {
              target: S.SENDING,
              actions: [props.send.from(({ memory }) => memory.request)],
            },
          },
        },
      },
    }),
  );

const ReconcileText = fragment(
  {
    id: "Examples/ReconcileText",
    kind: "state",
    input: { attempt: Attempt },
    memory: { attempt: Attempt },
    initial: ({ input }) => ({ attempt: input.attempt }),
    states: ["WAITING"],
    props: {
      retry: fragment.request({
        operation: "retry",
        input: Attempt,
        replies: {
          success: { Succeeded: { receipt: TextReceipt } },
          failure: { Refused: { reason: Schema.String } },
          unknown: "Uncertain",
          notSent: "NotSent",
          interrupt: "Interrupted",
          defect: "Defected",
        },
      }),
    },
    exits: {
      Done: { attemptId: Schema.String, receipt: TextReceipt, request: TextRequest },
      Failed: { attemptId: Schema.String, reason: Schema.String },
      Pending: { attempt: Attempt, reason: Schema.String },
    },
  },
  ({ S, props, exits }) => ({
    default: S.WAITING,
    start: { retry: ({ input }) => input.attempt },
    states: {
      WAITING: {
        on: {
          "retry.Succeeded": { target: exits.Done.from(({ memory, event }) => ({
            attemptId: memory.attempt.id,
            receipt: event.receipt,
            request: Schema.decodeUnknownSync(TextRequest)(memory.attempt.input),
          })) },
          "retry.Refused": { target: exits.Failed.from(({ memory, event }) => ({
            attemptId: memory.attempt.id,
            reason: event.reason,
          })) },
          "retry.Uncertain": { target: exits.Pending.from(({ event }) => ({
            attempt: event.attempt,
            reason: "Still uncertain; retain this Attempt",
          })) },
          "retry.NotSent": { target: exits.Pending.from(({ memory }) => ({
            attempt: memory.attempt,
            reason: "Reconciliation not invoked; the original write remains unresolved",
          })) },
          "retry.Interrupted": { target: exits.Pending.from(({ event }) => ({
            attempt: event.attempt,
            reason: "Reconciliation interrupted; retain its Attempt",
          })) },
          "retry.Defected": { target: exits.Pending.from(({ event }) => ({
            attempt: event.attempt,
            reason: "Reconciliation defect; retain its Attempt",
          })) },
        },
      },
    },
  }),
);

const RetryHost = definition({
  id: "Examples/RetryHost",
  states: [
    "EDITING",
    { ASK: ConfirmText },
    { SAVE: CommitWithRetry(2, 1000) },
    { RECONCILE: ReconcileText },
    "SAVED",
    "FAILED",
  ],
  events: { Review: {}, Leave: {}, Reconcile: { attempt: Attempt } },
  embeds: { title: TextField },
  operations: { save: SaveText },
  memory: {
    message: Schema.String,
    pending: Schema.Array(Attempt),
    uncertain: Schema.Array(Attempt),
    completedIds: Schema.Array(Schema.String),
  },
  initial: () => ({ message: "", pending: [], uncertain: [], completedIds: [] }),
});

const RetryMachine = machine(RetryHost, ({ S, O }) => ({
  default: S.EDITING,
  embeds: { title: { input: () => ({ start: "" }), props: { canEdit: () => true } } },
  abandoned: {
    save: {
      updateMemory: ({ memory, payload }) => {
        if (payload[0].outcome._tag === "Pending") {
          return { pending: payload.reduce((items, fact) => addAttempt(items, fact.attempt), memory.pending) };
        }
        const { outcome, attempt, operation } = payload[0];
        if (outcome._tag === "Unknown" || outcome._tag === "Interrupt" || outcome._tag === "Defect") {
          return {
            pending: removeAttempt(memory.pending, attempt.id),
            uncertain: addAttempt(memory.uncertain, attempt),
            message: "Departed write needs reconciliation; the current step continues",
          };
        }
        if (outcome._tag === "NotSent") {
          return {
            pending: removeAttempt(memory.pending, attempt.id),
            uncertain: operation === "retry" ? memory.uncertain : removeAttempt(memory.uncertain, attempt.id),
            message: "This call was not invoked",
          };
        }
        if (outcome._tag === "Success") {
          return {
            pending: removeAttempt(memory.pending, attempt.id),
            uncertain: removeAttempt(memory.uncertain, attempt.id),
            completedIds: [...memory.completedIds, outcome.value.id],
            message: "Departed write completed; the current step continues",
          };
        }
        return {
          pending: removeAttempt(memory.pending, attempt.id),
          uncertain: removeAttempt(memory.uncertain, attempt.id),
          message: "Departed write definitively failed",
        };
      },
    },
  },
  on: {
    Leave: S.EDITING,
    Reconcile: {
      target: S.RECONCILE,
      guard: ({ memory, event }) =>
        (memory.pending.length === 0 && memory.SAVE === undefined && memory.ASK === undefined && memory.RECONCILE === undefined &&
          memory.uncertain.some((item) => Equal.equals(item, event.attempt))) || deny("NotReadyToReconcile"),
      input: ({ event }) => ({ attempt: event.attempt }),
    },
  },
  states: {
    EDITING: {
      on: {
        Review: {
          target: S.ASK,
          guard: ({ memory }) =>
            (memory.title.error === null && memory.pending.length === 0 && memory.uncertain.length === 0) || deny("ResolveBeforeReview"),
          input: ({ memory }) => ({ request: { id: "document-2", value: memory.title.value } }),
          updateMemory: () => ({ message: "" }),
        },
      },
    },
    ASK: {
      exits: {
        Confirmed: { target: S.SAVE, input: ({ payload }) => ({ request: payload.request }) },
        Declined: S.EDITING,
      },
    },
    SAVE: {
      props: {
        send: ({ reply }) => ({
          actions: [O.save.commit(({ payload }) => payload, {
            outcomes: {
              success: reply.Succeeded.from((receipt) => ({ receipt })),
              failure: {
                Busy: reply.Busy,
                Rejected: reply.Rejected.from((error) => ({ reason: error.reason })),
              },
            },
          })],
        }),
      },
      exits: {
        Done: {
          target: S.SAVED,
          updateMemory: ({ memory, payload }) => ({
            message: "Confirmed request saved; review any newer draft separately",
            completedIds: [...memory.completedIds, payload.receipt.id],
          }),
        },
        Failed: { target: S.FAILED, updateMemory: ({ payload }) => ({ message: payload.reason }) },
        Uncertain: {
          target: S.EDITING,
          updateMemory: ({ memory, payload }) => ({
            message: "Reconcile the existing Attempt before another review",
            uncertain: memory.uncertain.some((item) => item.id === payload.attempt.id)
              ? memory.uncertain : [...memory.uncertain, payload.attempt],
          }),
        },
      },
    },
    RECONCILE: {
      props: {
        retry: ({ reply }) => ({
          actions: [O.save.retry(({ payload }) => payload, {
            outcomes: {
              success: reply.Succeeded.from((receipt) => ({ receipt })),
              failure: {
                Busy: reply.Refused.from(() => ({ reason: "Definitely not applied: Busy" })),
                Rejected: reply.Refused.from((error) => ({ reason: error.reason })),
              },
            },
          })],
        }),
      },
      exits: {
        Done: {
          target: S.SAVED,
          updateMemory: ({ memory, payload }) => ({
            message: "Reconciled using the original Attempt id",
            uncertain: memory.uncertain.filter((item) => item.id !== payload.attemptId),
            completedIds: [...memory.completedIds, payload.receipt.id],
          }),
        },
        Failed: {
          target: S.EDITING,
          updateMemory: ({ memory, payload }) => ({
            message: payload.reason,
            uncertain: memory.uncertain.filter((item) => item.id !== payload.attemptId),
          }),
        },
        Pending: { target: S.EDITING, updateMemory: ({ payload }) => ({ message: payload.reason }) },
      },
    },
    SAVED: {},
    FAILED: {},
  },
}));

export function RetryDemo() {
  const actor = useActor(RetryMachine);
  const value = useView(actor, (snapshot) => snapshot.memory.title.value);
  const captured = useView(actor, (snapshot) => snapshot.memory.ASK?.request.value);
  const state = useView(actor, (snapshot) => snapshot.state);
  const retries = useView(actor, (snapshot) => snapshot.memory.SAVE?.retries);
  const sending = useView(actor, (snapshot) => snapshot.memory.SAVE?.request.value);
  const message = useView(actor, (snapshot) => snapshot.memory.message);
  const uncertain = useView(actor, (snapshot) => snapshot.memory.uncertain);
  const completed = useView(actor, (snapshot) => snapshot.memory.completedIds.length);
  return (
    <section>
      <input value={value} onChange={(event) =>
        actor.send(RetryHost.E.title.Edit({ value: event.currentTarget.value }))} />
      <button onClick={() => actor.send(RetryHost.E.Review())}>Review</button>
      {captured !== undefined && (
        <div>
          <p>Send exactly: {captured}</p>
          <button onClick={() => actor.send(RetryHost.E.ASK.Yes())}>Confirm</button>
          <button onClick={() => actor.send(RetryHost.E.ASK.No())}>Decline</button>
        </div>
      )}
      <button onClick={() => actor.send(RetryHost.E.Leave())}>Leave step</button>
      {uncertain.map((attempt) => (
        <button key={attempt.id} onClick={() => actor.send(RetryHost.E.Reconcile({ attempt }))}>
          Reconcile {attempt.id}
        </button>
      ))}
      <output>{state}: sending {sending ?? "none"}; retries {retries ?? 0}; completed {completed}. {message}</output>
    </section>
  );
}
```

The first send and retries use the same fixed request, retained in memory.request for retries. No READY snapshot, zero timer
or host-owned first-send selector is needed. `maxRetries = 2` permits initial plus two definitive
Busy retries. Reconciliation calls `O.save.retry` with the original Attempt id/input, whereas a
fresh commit after a definitive Busy gets a fresh Attempt id. A failed reconciliation with a
*definitive* failure resolves uncertainty; an interrupt, defect or another unknown retains the
Attempt. The examples use TextRequest's identity encoding when decoding `Attempt.input`.

In round 2 the departure Pending fact blocks B before A settles. If an already admitted peer
exists, A’s later fact still cannot move it: the single operation observer only updates the ledger.
Success also resolves that ledger without targeting a step. A ledger makes outcomes visible but cannot
infer business rules such as “a second order must never be placed”; that policy remains explicit.

### 2.6 Poll: initial lookup, live interval and refresh until the host leaves

This example exercises both retained read kinds. The first lookup can reuse fresh resource data;
subsequent refetches deliberately request fresh data. `everyMs` is a live prop: changing the host
setting affects the next arming, without duplicating that setting in poll memory. The host may
close during either read. Neither read owns a transaction Attempt.

```tsx
const Heartbeat = resource({
  id: "Examples/Heartbeat",
  key: () => ({}),
  result: Schema.Struct({ label: Schema.String }),
  staleTime: "1 second",
  gcTime: "1 minute",
  lookup: () => Effect.succeed({ label: "Server reachable" }),
});

const ReadReplies = {
  success: { Ok: {} },
  failure: { Failed: {} },
  interrupt: "Interrupted",
  defect: "Defected",
};

const Poll = fragment(
  {
    id: "Examples/Poll",
    kind: "state",
    states: ["LOADING", "WAITING", "REFRESHING"],
    internalEvents: { Tick: {} },
    memory: { failures: Schema.Int },
    initial: () => ({ failures: 0 }),
    props: {
      everyMs: fragment.prop(Schema.Int),
      load: fragment.request({ operation: "lookup", input: Empty, replies: ReadReplies }),
      refresh: fragment.request({ operation: "refetch", input: Empty, replies: ReadReplies }),
    },
  },
  ({ S, E, props }) => ({
    default: S.LOADING,
    start: { load: () => ({}) },
    states: {
      LOADING: {
        on: {
          "load.Ok": { target: S.WAITING, updateMemory: () => ({ failures: 0 }) },
          "load.Failed": { target: S.WAITING, updateMemory: () => ({ failures: 1 }) },
          "load.Interrupted": { target: S.WAITING, updateMemory: () => ({ failures: 1 }) },
          "load.Defected": { target: S.WAITING, updateMemory: () => ({ failures: 1 }) },
        },
      },
      WAITING: {
        schedules: {
          tick: {
            schedule: ({ memory, props }) => props.everyMs * 2 ** Math.min(memory.failures, 5),
            send: E.Tick,
          },
        },
        on: { Tick: { target: S.REFRESHING, actions: [props.refresh.from(() => ({}))] } },
      },
      REFRESHING: {
        on: {
          "refresh.Ok": { target: S.WAITING, updateMemory: () => ({ failures: 0 }) },
          "refresh.Failed": {
            target: S.WAITING,
            updateMemory: ({ memory }) => ({ failures: Math.min(memory.failures + 1, 5) }),
          },
          "refresh.Interrupted": {
            target: S.WAITING,
            updateMemory: ({ memory }) => ({ failures: Math.min(memory.failures + 1, 5) }),
          },
          "refresh.Defected": {
            target: S.WAITING,
            updateMemory: ({ memory }) => ({ failures: Math.min(memory.failures + 1, 5) }),
          },
        },
      },
    },
  }),
);

const PollHost = definition({
  id: "Examples/PollHost",
  states: ["CLOSED", { LIVE: Poll }],
  events: { Open: {}, Close: {}, Faster: {} },
  operations: { heartbeat: Heartbeat },
  memory: { intervalMs: Schema.Int },
  initial: () => ({ intervalMs: 1000 }),
});

const PollMachine = machine(PollHost, ({ S, O }) => ({
  default: S.CLOSED,
  on: { Faster: { target: "self", updateMemory: () => ({ intervalMs: 250 }) } },
  states: {
    CLOSED: { on: { Open: S.LIVE } },
    LIVE: {
      on: { Close: S.CLOSED },
      activities: { status: O.heartbeat.subscribe(() => ({})) },
      props: {
        everyMs: ({ memory }) => memory.intervalMs,
        load: ({ reply }) => ({
          actions: [O.heartbeat.lookup(() => ({}), { outcomes: { success: reply.Ok } })],
        }),
        refresh: ({ reply }) => ({
          actions: [O.heartbeat.refetch(() => ({}), { outcomes: { success: reply.Ok } })],
        }),
      },
    },
  },
}));

export function PollDemo() {
  const actor = useActor(PollMachine);
  const state = useView(actor, (snapshot) => snapshot.state);
  const failures = useView(actor, (snapshot) => snapshot.memory.LIVE?.failures);
  const label = useView(actor, (snapshot) => snapshot.activities.status?.data?.label);
  const interval = useView(actor, (snapshot) => snapshot.memory.intervalMs);
  return (
    <section>
      <button onClick={() => actor.send(PollHost.E.Open())}>Open</button>
      <button onClick={() => actor.send(PollHost.E.Close())}>Close</button>
      <button onClick={() => actor.send(PollHost.E.Faster())}>Faster next interval</button>
      <output>{state}: {label ?? "No live subscription"}; failures {failures ?? 0}; base {interval}ms</output>
    </section>
  );
}
```

The live interval is sampled at schedule arming, following Machines O5; it does not secretly
retime an already armed deadline. Heartbeat has E=never, so the host supplies no failure map.
The reusable fragment still handles its declared Failed variants: another compatible binding can
fail. The audit correctly rejected dropping those handlers based on this one placement. Both
read kinds restore outstanding calls as interrupt, and Close invalidates delivery by activation.
Every timer firing carries its arming identity too, so a queued firing from before a restart is
not mistaken for the current timer.

### 2.7 Two nested levels: checkout wizard → address step → two fields

Input travels through actual activation boundaries: host draft → wizard input → address input →
field input. Each intermediate level owns its children's initialization. Since an input-bearing
state fragment cannot be a default child, the wizard starts at OVERVIEW and explicitly opens
ADDRESS. Public command names compose without forwarding or an exposure switch.

```tsx
const Address = Schema.Struct({ street: Schema.String, city: Schema.String });

const AddressStep = fragment(
  {
    id: "Examples/AddressStep",
    kind: "state",
    input: { address: Address },
    events: { Next: {}, Back: {} },
    embeds: { street: TextField, city: TextField },
    props: { canEdit: fragment.guard() },
    exits: { Done: { address: Address }, Back: { address: Address } },
  },
  ({ props, exits }) => ({
    embeds: {
      street: {
        input: ({ input }) => ({ start: input.address.street }),
        props: { canEdit: props.canEdit },
      },
      city: {
        input: ({ input }) => ({ start: input.address.city }),
        props: { canEdit: props.canEdit },
      },
    },
    on: {
      Next: {
        target: exits.Done.from(({ memory }) => ({
          address: { street: memory.street.value, city: memory.city.value },
        })),
        guard: ({ memory }) =>
          (memory.street.error === null && memory.city.error === null) || deny("InvalidAddress"),
      },
      Back: { target: exits.Back.from(({ memory }) => ({
        address: { street: memory.street.value, city: memory.city.value },
      })) },
    },
  }),
);

const CheckoutWizard = fragment(
  {
    id: "Examples/CheckoutWizard",
    kind: "state",
    input: { address: Address },
    memory: { addressDraft: Address },
    initial: ({ input }) => ({ addressDraft: input.address }),
    states: ["OVERVIEW", { ADDRESS: AddressStep }],
    events: { EditAddress: {} },
    props: { canEdit: fragment.guard() },
    exits: { Done: { address: Address } },
  },
  ({ S, props, exits }) => ({
    default: S.OVERVIEW,
    states: {
      OVERVIEW: {
        on: {
          EditAddress: { target: S.ADDRESS, input: ({ memory }) => ({ address: memory.addressDraft }) },
        },
      },
      ADDRESS: {
        props: { canEdit: props.canEdit },
        exits: {
          Done: { target: exits.Done.from(({ payload }) => ({ address: payload.address })) },
          Back: {
            target: S.OVERVIEW,
            updateMemory: ({ payload }) => ({ addressDraft: payload.address }),
          },
        },
      },
    },
  }),
);

const CheckoutHost = definition({
  id: "Examples/CheckoutHost",
  states: ["CART", { CHECKOUT: CheckoutWizard }, "RECEIVED"],
  input: { address: Address },
  events: { Start: {}, Cancel: {}, ToggleLock: {} },
  memory: { locked: Schema.Boolean, addressDraft: Address },
  initial: ({ input }) => ({ locked: false, addressDraft: input.address }),
});

const CheckoutMachine = machine(CheckoutHost, ({ S }) => ({
  default: S.CART,
  on: {
    Cancel: {
      target: S.CART,
      updateMemory: ({ memory }) => ({
        addressDraft: memory.CHECKOUT?.ADDRESS !== undefined
          ? { street: memory.CHECKOUT.ADDRESS.street.value, city: memory.CHECKOUT.ADDRESS.city.value }
          : memory.CHECKOUT?.addressDraft ?? memory.addressDraft,
      }),
    },
    ToggleLock: {
      target: "self",
      updateMemory: ({ memory }) => ({ locked: !memory.locked }),
    },
  },
  states: {
    CART: {
      on: { Start: { target: S.CHECKOUT, input: ({ memory }) => ({ address: memory.addressDraft }) } },
    },
    CHECKOUT: {
      props: { canEdit: ({ memory }) => !memory.locked || deny("CheckoutLocked") },
      exits: {
        Done: {
          target: S.RECEIVED,
          updateMemory: ({ payload }) => ({ addressDraft: payload.address }),
        },
      },
    },
    RECEIVED: {},
  },
}));

export function CheckoutDemo() {
  const actor = useActor(CheckoutMachine, { input: { address: { street: "", city: "" } } });
  const street = useView(actor, (snapshot) => snapshot.memory.CHECKOUT?.ADDRESS?.street.value);
  const city = useView(actor, (snapshot) => snapshot.memory.CHECKOUT?.ADDRESS?.city.value);
  const streetError = useView(actor, (snapshot) => snapshot.memory.CHECKOUT?.ADDRESS?.street.error);
  const cityError = useView(actor, (snapshot) => snapshot.memory.CHECKOUT?.ADDRESS?.city.error);
  const received = useView(actor, (snapshot) => snapshot.memory.addressDraft);
  return (
    <section>
      <button onClick={() => actor.send(CheckoutHost.E.Start())}>Start checkout</button>
      <button onClick={() => actor.send(CheckoutHost.E.CHECKOUT.EditAddress())}>Edit address</button>
      {street !== undefined && city !== undefined && (
        <div>
          <input aria-label="Street" value={street} onChange={(event) =>
            actor.send(CheckoutHost.E.CHECKOUT.ADDRESS.street.Edit({ value: event.currentTarget.value }))} />
          <output>{streetError}</output>
          <input aria-label="City" value={city} onChange={(event) =>
            actor.send(CheckoutHost.E.CHECKOUT.ADDRESS.city.Edit({ value: event.currentTarget.value }))} />
          <output>{cityError}</output>
          <button onClick={() => actor.send(CheckoutHost.E.CHECKOUT.ADDRESS.Next())}>Next</button>
          <button onClick={() => actor.send(CheckoutHost.E.CHECKOUT.ADDRESS.Back())}>Back</button>
        </div>
      )}
      <button onClick={() => actor.send(CheckoutHost.E.ToggleLock())}>Toggle lock</button>
      <button onClick={() => actor.send(CheckoutHost.E.Cancel())}>Cancel checkout</button>
      <output>{received.street}, {received.city}</output>
    </section>
  );
}
```

The field's public Edit still executes its declared canEdit guard. Public Blur goes directly to
the field; no ancestor can forget or guard its forwarding. Hosts cannot intercept a child event
in their own `on` or write a child slice. Private timers and reply names never join the public API.

Field seeds come directly from the address activation input; no intermediate seed copy is
stored. Completed/backed-out drafts are stored only at the boundary where their owner leaves.
Cancel also checkpoints the current address, so abandoning this example does not silently erase
it. This host-side checkpoint deliberately couples cancellation to readable inner fields: the
E2 cost is real. The general API only warns on a draft-losing leave edge; it cannot infer which
arbitrary strings an application considers user data.

### 2.8 Autosave: recovery, trailing edits and normalization

Only Edit advances the edit version, which directly restarts the quiet schedule. A normalized
response never does. The quiet timer delivers Flush: IDLE starts a request,
SENDING remembers that the latest quiet period elapsed, and FAILED retries after a new quiet edit.
All same-turn guards/updates can therefore use the plans' pre-turn snapshot.

```tsx
const AutoSave = fragment(
  {
    id: "Examples/AutoSave",
    kind: "state",
    input: { id: Schema.String, draft: Schema.String },
    states: ["IDLE", "SENDING", "FAILED"],
    events: { Edit: { value: Schema.String } },
    internalEvents: { Flush: {} },
    memory: {
      id: Schema.String,
      draft: Schema.String,
      editVersion: Schema.Int,
      sentVersion: Schema.Int,
      due: Schema.Boolean,
      reason: Schema.String,
    },
    initial: ({ input }) => ({
      id: input.id,
      draft: input.draft,
      editVersion: 0,
      sentVersion: 0,
      due: false,
      reason: "",
    }),
    exits: { Uncertain: { attempt: Attempt, draft: Schema.String } },
    props: {
      save: fragment.request({
        operation: "commit",
        input: TextRequest,
        replies: {
          success: { Saved: { value: Schema.String } },
          failure: { Rejected: { reason: Schema.String } },
          unknown: "Uncertain",
          notSent: "NotSent",
          interrupt: "Interrupted",
          defect: "Defected",
        },
      }),
    },
  },
  ({ S, E, props, exits }) => {
    const saveDraft = props.save.from(({ memory }) => ({ id: memory.id, value: memory.draft }));
    return {
      default: S.IDLE,
      schedules: {
        quiet: { schedule: 300, send: E.Flush, restartOn: ({ memory }) => memory.editVersion },
      },
      on: {
        Edit: {
          target: "self",
          updateMemory: ({ memory, event }) => ({
            draft: event.value,
            editVersion: memory.editVersion + 1,
            due: false,
          }),
        },
      },
      states: {
        IDLE: {
          on: {
            Flush: {
              target: S.SENDING,
              updateMemory: ({ memory }) => ({ sentVersion: memory.editVersion, due: false, reason: "" }),
              actions: [saveDraft],
            },
          },
        },
        SENDING: {
          on: {
            Flush: { target: "self", updateMemory: () => ({ due: true }) },
            "save.Saved": [
              {
                target: "self",
                guard: ({ memory }) => memory.due || deny("NoQuietTrailingEdit"),
                updateMemory: ({ memory }) => ({ sentVersion: memory.editVersion, due: false }),
                actions: [saveDraft],
              },
              {
                target: S.IDLE,
                updateMemory: ({ memory, event }) =>
                  memory.editVersion === memory.sentVersion ? { draft: event.value } : {},
              },
            ],
            "save.Rejected": {
              target: S.FAILED,
              updateMemory: ({ event }) => ({ reason: event.reason }),
            },
            "save.Uncertain": { target: exits.Uncertain.from(({ memory, event }) => ({
              attempt: event.attempt,
              draft: memory.draft,
            })) },
            "save.NotSent": {
              target: S.FAILED,
              updateMemory: () => ({ reason: "Not invoked; next quiet edit may submit" }),
            },
            "save.Interrupted": { target: exits.Uncertain.from(({ memory, event }) => ({
              attempt: event.attempt, draft: memory.draft,
            })) },
            "save.Defected": { target: exits.Uncertain.from(({ memory, event }) => ({
              attempt: event.attempt, draft: memory.draft,
            })) },
          },
        },
        FAILED: {
          on: {
            Flush: {
              target: S.SENDING,
              updateMemory: ({ memory }) => ({ sentVersion: memory.editVersion, due: false, reason: "" }),
              actions: [saveDraft],
            },
          },
        },
      },
    };
  },
);

const AutoSaveHost = definition({
  id: "Examples/AutoSaveHost",
  states: ["CLOSED", { EDITOR: AutoSave }, { RECONCILE: ReconcileText }],
  events: { Open: {}, Close: {}, Reconcile: { attempt: Attempt } },
  operations: { save: SaveText },
  memory: {
    draft: Schema.String,
    pending: Schema.Array(Attempt),
    uncertain: Schema.Array(Attempt),
    completedIds: Schema.Array(Schema.String),
    message: Schema.String,
  },
  initial: () => ({ draft: "", pending: [], uncertain: [], completedIds: [], message: "" }),
});

const AutoSaveMachine = machine(AutoSaveHost, ({ S, O }) => ({
  default: S.CLOSED,
  abandoned: {
    save: {
      updateMemory: ({ memory, payload }) => {
        if (payload[0].outcome._tag === "Pending") {
          return { pending: payload.reduce((items, fact) => addAttempt(items, fact.attempt), memory.pending) };
        }
        const { outcome, attempt, operation } = payload[0];
        if (outcome._tag === "Unknown" || outcome._tag === "Interrupt" || outcome._tag === "Defect") {
          return {
            pending: removeAttempt(memory.pending, attempt.id),
            uncertain: addAttempt(memory.uncertain, attempt),
            message: "Departed write needs reconciliation; the current step continues",
          };
        }
        if (outcome._tag === "NotSent") {
          return {
            pending: removeAttempt(memory.pending, attempt.id),
            uncertain: operation === "retry" ? memory.uncertain : removeAttempt(memory.uncertain, attempt.id),
            message: "This call was not invoked",
          };
        }
        if (outcome._tag === "Success") {
          return {
            pending: removeAttempt(memory.pending, attempt.id),
            uncertain: removeAttempt(memory.uncertain, attempt.id),
            completedIds: [...memory.completedIds, outcome.value.id],
            message: "Departed write completed; the current step continues",
          };
        }
        return {
          pending: removeAttempt(memory.pending, attempt.id),
          uncertain: removeAttempt(memory.uncertain, attempt.id),
          message: "Departed write definitively failed",
        };
      },
    },
  },
  on: {
    Reconcile: {
      target: S.RECONCILE,
      guard: ({ memory, event }) =>
        (memory.pending.length === 0 && memory.EDITOR === undefined && memory.RECONCILE === undefined &&
          memory.uncertain.some((item) => Equal.equals(item, event.attempt))) || deny("CloseBeforeReconcile"),
      input: ({ event }) => ({ attempt: event.attempt }),
    },
  },
  states: {
    CLOSED: {
      on: {
        Open: {
          target: S.EDITOR,
          guard: ({ memory }) => (memory.pending.length === 0 && memory.uncertain.length === 0) || deny("ReconcileFirst"),
          input: ({ memory }) => ({ id: "autosave-document", draft: memory.draft }),
        },
      },
    },
    EDITOR: {
      on: {
        Close: {
          target: S.CLOSED,
          updateMemory: ({ memory }) => ({ draft: memory.EDITOR.draft }),
        },
      },
      props: {
        save: ({ reply }) => ({
          actions: [O.save.commit(({ payload }) => payload, {
            outcomes: {
              success: reply.Saved.from((receipt) => ({ value: receipt.value })),
              failure: {
                Busy: reply.Rejected.from(() => ({ reason: "Busy; next quiet edit retries" })),
                Rejected: reply.Rejected.from((error) => ({ reason: error.reason })),
              },
            },
          })],
        }),
      },
      exits: {
        Uncertain: {
          target: S.CLOSED,
          updateMemory: ({ memory, payload }) => ({
            draft: payload.draft,
            message: "Saved draft locally; reconcile its outstanding Attempt",
            uncertain: memory.uncertain.some((item) => item.id === payload.attempt.id)
              ? memory.uncertain : [...memory.uncertain, payload.attempt],
          }),
        },
      },
    },
    RECONCILE: {
      props: {
        retry: ({ reply }) => ({
          actions: [O.save.retry(({ payload }) => payload, {
            outcomes: {
              success: reply.Succeeded.from((receipt) => ({ receipt })),
              failure: {
                Busy: reply.Refused.from(() => ({ reason: "Definitely not applied: Busy" })),
                Rejected: reply.Refused.from((error) => ({ reason: error.reason })),
              },
            },
          })],
        }),
      },
      exits: {
        Done: {
          target: S.CLOSED,
          updateMemory: ({ memory, payload }) => ({
            draft: memory.draft === payload.request.value ? payload.receipt.value : memory.draft,
            uncertain: memory.uncertain.filter((item) => item.id !== payload.attemptId),
            message: "Reconciled the original Attempt",
          }),
        },
        Failed: {
          target: S.CLOSED,
          updateMemory: ({ memory, payload }) => ({
            uncertain: memory.uncertain.filter((item) => item.id !== payload.attemptId),
            message: payload.reason,
          }),
        },
        Pending: { target: S.CLOSED, updateMemory: ({ payload }) => ({ message: payload.reason }) },
      },
    },
  },
}));

export function AutoSaveDemo() {
  const actor = useActor(AutoSaveMachine);
  const draft = useView(actor, (snapshot) => snapshot.memory.EDITOR?.draft ?? snapshot.memory.draft);
  const editing = useView(actor, (snapshot) => AutoSaveHost.S.EDITOR.is(snapshot));
  const reason = useView(actor, (snapshot) => snapshot.memory.EDITOR?.reason ?? snapshot.memory.message);
  const state = useView(actor, (snapshot) => snapshot.state);
  const uncertain = useView(actor, (snapshot) => snapshot.memory.uncertain);
  return (
    <section>
      <button onClick={() => actor.send(AutoSaveHost.E.Open())}>Open editor</button>
      <input value={draft} disabled={!editing} onChange={(event) =>
        actor.send(AutoSaveHost.E.EDITOR.Edit({ value: event.currentTarget.value }))} />
      <button onClick={() => actor.send(AutoSaveHost.E.Close())}>Close and retain draft</button>
      {uncertain.map((attempt) => (
        <button key={attempt.id} onClick={() => actor.send(AutoSaveHost.E.Reconcile({ attempt }))}>
          Reconcile {attempt.id}
        </button>
      ))}
      <output>{state}: {reason}</output>
    </section>
  );
}
```

A response normalizing `" x "` to `"x"` changes no edit version and sends nothing else. On success,
if a later edit's quiet period has elapsed, `due = true` starts one next request from the pre-turn
latest draft. A newer edit clears the bit, so an older quiet period cannot submit that new edit
early. FAILED accepts the next Flush; it no longer traps all future saves. Close checkpoints the
draft before local memory disappears, and an uncertain exit carries it explicitly. Reconciliation
normalizes the retained draft only if it still equals that Attempt's original submitted value.

Closing before the quiet period retains an unsent draft but does **not** auto-submit it on reopen:
`restartOn` correctly starts idle. The user must edit to schedule another save; a production editor
could declare an explicit resume/save command. This is deliberate, not an accidental claim that
an idle-on-entry debounce fires. Late completion never overwrites a newer retained draft.
The example is not a collaborative editor: conflict/version policies and bounded audit retention
remain application choices, and arbitrary new autosave code can still create feedback loops.

### 2.9 Keyword ledger and counts

Counting rule: count an author-facing spelling once; qualify an existing word when its **new API
role** matters (e.g. transition.input). Count the reserved observer data separately. Do not count
author names, each occurrence, existing plan vocabulary or Effect/TS/DOM syntax as new keywords.

| Count group | Exact counted surface | Count |
| --- | --- | --- |
| Core authoring | `fragment`, `kind`, `"embedded"`, `"state"`, `hostEvents`, `embeds`, `props`, `exits`, `raise`, `notify`, `start`, `fragment.prop`, `fragment.callback`, `fragment.guard`, `fragment.request`, `.optional()`, `request.operation`, `request.replies`, `reply`, `abandoned`, `payload` | 21 |
| New capture sites | `transition.input`, `embeds.input` | 2 |
| Story surface | `story.fragment`, `recipe.E`, `$Begin`, `$Leave`, `calls`, `exit` | 6 |
| Observer record roles | `observer.outcome`, `observer.attempt`, `observer.binding`, `observer.operation` | 4 |
| Observer outcome tags | `"Pending"`, `"Success"`, `"Failure"`, `"Unknown"`, `"Interrupt"`, `"Defect"`, `"NotSent"` | 7 |
| Additional system-reply kind | `notSent` | 1 |

**New count: 29 authoring/Story keywords or new roles, plus 12 reserved protocol-data roles/tags
= 41 in the fully inclusive ledger. There are 28 numbered normative rules below.** On the same
authoring-only rubric round 1 had 30: notify adds one and merging the two driver namespaces removes
two. The audit's approximately 34 keywords / 60–70 prose rules included unledgered roles and
restatements; it is not an exact like-for-like baseline. The new protocol data is counted openly,
not hidden to claim a larger numerical saving. The 28-rule catalog replaces scattered normative
prose; verification obligations are not counted again as independent rules.

| Classification | Other identifiers / reserved uses |
| --- | --- |
| Existing in plans | `definition`, `machine`, `resource`, `transaction`, `Attempt`, `deny`, `S`, `E`, `O`; `id`, `states`, `events`, `internalEvents`, `input`, `memory`, `initial`, `operations`, `default`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `schedule`, `restartOn`, `send`, `activities`, `outcomes`; `commit`, `retry`, `lookup`, `refetch`, `subscribe`, `key`, `concurrency`, `result`, `staleTime`, `gcTime`; `success`, `failure`, `unknown`, `interrupt`, `defect`, `_tag`; `.from`, `.is`, `"self"`, `"allow"`; `event`, `context`, `now`; `useActor`, `useView`; `story`, `.machine`, `.process`, `.advance`, `.checkpoint`, `.run`, `.send`, captured snapshots/checkpoints. Existing names reused in the explicitly counted new roles above are still marked new there. |
| Existing external | Effect's `Context.Service`, `Effect.Effect`, `.gen`, `.fail`, `.succeed`, `.flatMap`, `.sleep`, `Layer.succeed`, `Equal.equals`; `Schema.Struct`, `.String`, `.Boolean`, `.Int`, `.NullOr`, `.Array`, `.decodeUnknownSync`, schema `.Type`; TS/TSX/DOM syntax, array methods and `Math.min`. |
| Author-chosen | Every other identifier, state, instance, prop, event, reply/exit name, id, denial code, checkpoint and UI string. Quoted on keys combine the author's port/variant names. Input payload field start is author-chosen, distinct from the reserved behaviour start field. |

No kind-to-two-constructors drop is applied because it conflicts with the assigned single shape.
No dead-reply-handler or optional-guard drop is applied because correctness §8.3 says they reopen
D4/A6/H1. No ranked feature cut is applied; §8 records them for user decision.

## 3. Rules

This is the single normative catalog for the revised proposal. The explanations after it define
phases and data shapes; check mirrors these rules rather than introducing another parallel set.

| Rule | Requirement |
| --- | --- |
| R1 | Every fragment declares exactly one kind and accepts only that placement; embedded forbids states/exits/start, while omitted empty declarations do not affect kind. |
| R2 | Every instance has one containing activation; entry creates fresh local memory and exit invalidates its private delivery authority, with no lifetime opt-out. |
| R3 | Only a fragment writes its local memory and handles its private inputs; parents cannot patch child slices, inject event guards or target private internal states. |
| R4 | Events is public at every depth, hostEvents is immediate-owner input and internalEvents is schedule input; the lists and generated reply names are disjoint. |
| R5 | Raises address only an immediate child's hostEvents, never public/self inputs, private grandchildren, schedules, replies or exits. |
| R6 | Every prop is required unless a value/notification declares optional; missing optional values are undefined and notifications are inspectable no-ops; guards/requests/exits cannot silently opt out. |
| R7 | All data contracts use synchronous service-free Schema boundaries; functions remain TS and serialized/persisted eligibility is checked independently. |
| R8 | Ordinary transition selectors read one pre-turn snapshot; only incoming activation input may read post-patch parent memory, and initialization/start consume that fixed input without any memory parameter. |
| R9 | State input has one incoming-edge mapper; state fragments with input or start cannot occur on any default path; child input initialization may consume containing activation input directly. |
| R10 | Start is a map of request-port input selectors appended once to an accepted entry, never on internal substate changes, restore, hydration or attachment. |
| R11 | Synchronous callbacks occur only in notify, have no refusing guard, and their complete target/raise closure stays in the emitter's owning node. |
| R12 | Fragment completion has only the target: exits.Name form and every declared exit has an exhaustive parent continuation; normal ancestor departure is abandonment, not a fabricated exit. |
| R13 | A composed source alternative is atomic: a refused/unhandled raise declines the whole candidate, and check evaluates the identical pre-turn guard/payload chain without updates or effects. |
| R14 | Every reply, exit continuation and valid timer delivery is statically total through its entire notify/raise chain: unguarded final alternatives, total active recipients and no refusable raised dependency. |
| R15 | Same-turn producer chains are acyclic, have compatible targets and disjoint patches, fit 10,000 transitions, and cannot dispatch work from an owner removed before publication. |
| R16 | Each request binding terminates in exactly one matching finite operation; operation selectors receive only captured payload, and commit request bindings cannot use reject concurrency. |
| R17 | Binding-local producer origin and outcome-kind brands forbid cross-port/class remapping; host maps success and actual error tags, compiler owns all standard replies, and every declared variant is handled. |
| R18 | A call record and outstanding slot exist only after the complete admission batch succeeds; there is at most one per port, and duplicate/unadmitted/wrong-occurrence deliveries reject. |
| R19 | Exactly one terminal fact closes a call; a projection failure that would suppress delivery records its issue and produces the fixed unprojected defect reply once, never another user mapper. |
| R20 | NotSent guarantees non-invocation of an admitted call; transaction unknown/interrupt/defect retain the original Attempt, while read interrupt/defect carry no Attempt. |
| R21 | Every transaction operation has one surviving machine observer; departure invokes its Pending batch synchronously with the admitted Attempts before the leaving publication. |
| R22 | Observer batches identify each binding and commit/retry action; their handler is total and non-targeting/no-guard/no-raise/no-notify/no-self-send, and no failed observer may erase recovery authority. |
| R23 | Identity-preserving request relays retain exact operation/schema/class and enclosing-generation identities, resolve to one machine operation, and preserve its observer through every enclosing departure. |
| R24 | Persistence retains activation/call/Attempt/observer association, restores known outcomes once and unknown/notSent as proved, and never replays initial or start. |
| R25 | Every pending finite read restores as interrupt before new public input; its old execution is not resumed, independently of host subscriptions restarting. |
| R26 | Every firing is stamped with owner activation and arming identity; exit/restart invalidates queued old firings, and restartOn remains silently idle on entry. |
| R27 | Compiled inspection retains instance/contracts/producer/entry/observer provenance and captured data under existing sensitivity policy; incomplete type facts cannot certify complete analysis. |
| R28 | Story.fragment expands ordinary hosts/drivers/recorders and real service fixtures; it adds no privileged internal reply injection and must pass parity with that expansion. |

Raw typed failures and Cause details remain in-process under Operations/Diagnostics, as with
existing failure mappers. An observer derives Schema-owned journal fields from them; exporting
observer evidence does not serialize raw errors or callable authority.

### 3.1 Snapshot and entry phases

The same memory selector in an action or notification always reads pre-turn memory. Start does
not offer that selector signature: `start.send({ input })` receives the fixed entry value. An
embedded input initializer similarly receives containing `input`, not newly initialized memory.
The container's input remains available until its initializer/start/child initialization phase
finishes, then disappears. This avoids a dummy seed copy in AddressStep; the host actor's existing
input/memory rule is unchanged, while fragment input may initialize children without local memory.

Only the incoming `input` mapper sees post-patch parent memory plus the triggering event/exit
payload. Pure initialization derives new local memory from that fixed value. No guard depends
on it: new instances cannot be raised into during that same entry, and start has no guards,
callbacks or targets. Existing schedule arming continues Machines O5's arm-time snapshot and
Clock rules; live props such as Poll.everyMs are sampled there without changing existing deadlines.
This is one transition-memory rule, not three different meanings of `memory`.

A root embedded callback may target SETTLED because its owning node is the root; a state callback
cannot leave its placement. That one owner rule covers both kinds. Raises target only immediate child hostEvents; public commands already have their direct route.
AutoSave uses its own schedule for Flush, so no self-raise or public exposure is needed. This
applies the audit drop fully while preserving the same quiet-period behaviour with one counter.

### 3.2 Admission, check and terminal totality

For ordinary public inputs, expand candidate notify/raise chains against the same captured active
path and data. A denied child contributes its denial codes; an unhandled child contributes
RaisedInputUnhandled. Try the source's remaining alternatives/ancestors. Commit no partial patch,
target, timer restart or action from a declined candidate. Self is not a state change.

Check runs guards and only the pure payload mappers needed to feed composed guards; never updates,
initializers, start/admission selectors, memory projections or work. Such admission mappers have
no now input, so time cannot make checking and handling disagree. Their defects are path-specific
GuardDefect on check and the existing pre-commit issue behaviour on handling. InactiveRequestOwner,
escaping callbacks, incompatible targets and invalid receiver activations are structural errors,
not Allowed predictions. Existing check still cannot promise arbitrary action/schema projections
or remote operations succeed.

**Terminal inputs cannot take that ordinary refusal path.** R14 covers private replies, return
continuations, timer handlers and every notification/raise reachable from them. Each reachable
recipient must be present and statically total on all applicable paths. Guarded alternatives need
an unguarded fallback; a callback/raise cycle, absent handler, unsafe owner or guarded-only recipient
is an error at its source. An explicit unguarded no-op can represent a deliberate stale-value
policy, not a silently refused notification. This borrows codex-split's reply/return totality and
extends it to timers, as both round-2 reviews request. AutoSave.Flush has unguarded handlers in
IDLE, SENDING and FAILED, so its valid quiet timer cannot lose its delivery.

The old call slot is retired with its accepted terminal delivery and before a next call in that
same accepted candidate; it is not consumed before a potentially declined chain. Arbitrary user
callback defects remain visible program defects rather than proofs of successful business
completion. They cannot fabricate a second outcome or erase the runtime's recorded terminal fact.
The new defect fallback below addresses suppressed operation projection, not arbitrary recursive
bugs inside the defect handler itself.

### 3.3 Requests, projection defects and phantom replies

A binding is checked by nominal origin **and** its returned consumption path, not lexical scope
alone. Escaping a producer object does not make it usable in another action. Ordinary event
tokens cannot substitute for request producers. Every actual success/error tag and every declared
fragment variant remains covered, even if this placement has E=never; only the host failure map
is omitted for E=never. Do not specialize a shared fragment's handler totality to one host.

The runtime registers an admitted request occurrence only when all source patches, arguments,
keys, queue bounds and action admission validate. A failed batch publishes neither wait nor call;
it has no reply authority. Reject-concurrency bindings are forbidden rather than inventing a
reply for rejected work. A previously admitted queued call cancelled before adapter invocation
closes as notSent with its actual Attempt; this is a new Operations rule for request-bound work.
A second call while outstanding rejects before publication without altering the first. Request
identity includes actor incarnation, enclosing activations and sequence, even when retry reuses
an Attempt id. These rules close L8 without pretending admission failure was an adapter outcome.

For an admitted transaction, only notSent proves non-invocation. Adapter interrupt and defect
may follow remote effects; their fixed replies carry Attempt and the examples retain it for
retry of that same operation. They do not feed a fresh commit. A notSent reconciliation attempt
also does **not** prove that the original write never happened. The observer distinguishes
operation=retry to keep its prior uncertainty. Resources have no transaction Attempt and restore
pending work as interrupt, not notSent.

If an outcome projection throws or its private reply payload fails decoding, the runtime records
the issue and delivers that port's fixed defect event directly, with the original Attempt for a
transaction. No user mapper handles this fallback. It closes the registered request once and
can take the fragment's normal defect continuation. The same rule applies after abandonment,
using a raw Defect observer fact. If an unrelated write projection already reports an issue but
normal outcome delivery remains possible, keep that actual outcome instead of sending two facts.
This explicit request-bound exception to Machines O3 replaces the old dead-port-until-reentry
rule. A defective defect handler can still fail as application code; no recursive fallback loop
is invented. Runtime evidence preserves the real physical settlement for reconciliation.

### 3.4 One operation observer and the departure gap

Machine `abandoned.operationAlias` is one observer for all request bindings of that transaction,
including relayed commits and retries. No per-binding observer, forwarding internal event or root
on handler is authored. It has only updateMemory and optional finite observation actions. Target,
guard, raise, notify and actor-self send are rejected transitively; it cannot move a newer step.
Ordinary leaf-first handling is unchanged because application code never handles this private
framework source through on. Observers for different operations must own disjoint root fields.

The handler receives captured root memory plus a nonempty `payload` tuple of facts. A fact has:

| Field | Data |
| --- | --- |
| `outcome` | Pending, Success(value), Failure(error), Unknown, Interrupt, Defect or NotSent |
| `attempt` | The exact admitted Attempt, never a synthesized value for an unadmitted call |
| `binding` | Exact instance/port path as string segments; no callable producer authority |
| `operation` | Commit or retry action kind, so a failed/cancelled reconciliation cannot erase the original uncertainty |

On departure the tuple contains **all Pending facts for that operation** from the leaving scopes,
and the observer runs synchronously in that departure's batch before publication. A Pending
batch writes only pending in the examples, disjoint from a draft checkpoint or uncertain-result
exit. Each later settled observer turn carries one terminal fact. One call is retired once; it
is routed to a live private reply or its surviving observer, never both. A terminal already
queued when departure happens still uses the observer at delivery. A Pending obligation is
recorded even then, closing the queue-to-delivery gap as well as the network gap.

RetryHost.Review and AutoSaveHost.Open require both pending and uncertain to be empty. Leaving A
publishes pending before another public input can start B. Success/definitive failure/notSent
remove pending; unknown/interrupt/defect move it to uncertain. Reconcile is a public input carrying
an Attempt that its guard matches structurally against the ledger; its input mapper uses that
validated event value, not a throwing post-guard lookup. A Pending attempt cannot be reconciled
or freshly resubmitted. These are explicit sample business gates, not a generic promise that a
user-written observer/guard cannot ignore recovery. L7 therefore remains by convention in §5.

A Pending observer defect rejects the departure batch, so no unrecorded leave commits. A later
observer defect reports an issue and retains durable recovery authority; it cannot erase the
Attempt and invite a fresh write. Root ledgers still need application recovery from that bug.
An abrupt crash reconstructs missing Pending obligations from durable call records before new
public admission. Already admitted operations keep their cache consequences and lifetime; no
implicit cancel or remote rollback is added. This explicitly amends Operations O2's later-state
outcome delivery for request-bound work.

### 3.5 Relays, restore, timers and visibility

The retained relay `send: props.send` preserves exact input, operation kind and all outcome classes,
and adds enclosing-generation fences. It ends at one root machine operation/observer. Each pending
commit affected by any enclosing exit, re-entry or relay departure contributes its Pending fact;
a middle fragment cannot impersonate its child's producer. Relay loops/missing endpoints reject.

Persisted associations retain actor/instance/sequence/Attempt/observer identity. Restore delivers
known terminal facts once, acknowledged unresolved work as unknown, and proven never-invoked work
as notSent. The fixed notSent distinction is a request-bound refinement of Persistence O6's
interrupt rule, explicitly requiring amendment. Neither initial nor start replays. Old runtime
producer authority cannot address a new/restored incarnation. Every pending finite read becomes
interrupt before new public inputs, independent of activity resubscription.

Every firing has both activation and arming identity; restart invalidates even an already queued
old firing. A valid timer delivery must satisfy terminal totality, while a stale stamp is discarded
with evidence before handler admission. RestartOn still establishes a silent entry baseline and
does not arm for an initial dirty value. Frozen reads, source paths, schemas and ownership remain
inspectable. User-function purity, draft meaning and business liveness remain proof obligations,
not properties inferred from names or arbitrary TypeScript.

## 4. Testing a fragment alone

Story.fragment remains a generated ordinary-host recipe with id/input, operations, services,
fixtures and the **same** request props binding as production. It supplies the machine-level
observer and records notifications, admitted request calls, Pending/terminal facts and exit
results through ordinary memory/evidence. There is no Story-only omission in a request-binding
shape now: operation observers live on the machine, not each port. Optional notifications stay
unbound unless supplied; required ones get explicit generated recording handlers.

There is one flat `recipe.E` namespace. `$Begin` and `$Leave` are reserved wrapper controls;
subject inputs use their normal names/encoded paths, with stable escaping if they collide with a
control. No subject command becomes untestable. Public constructors alias the subject's actual
public route directly; only hostEvents get synthetic public-driver handlers raising into the
subject. This respects R5 without inventing a second owner route into public commands.

Both kinds start in an ordinary idle host. The static recipe prepends `$Begin` carrying the
fixed input; that accepted transition enters the state subject or its state-kind embedded
wrapper and appends start. No construction or default path invokes a commit. `$Leave` exits the
wrapper/subject by an ancestor transition, invoking Pending before that publication. Controls
are ordinary recorded public events, not internal-event injection or raw state override.

Checkpoints/end retain calls and exit as passive projections of generated host memory and
production request-admission evidence. Request fixtures are real service Layers. Unknown,
interrupt, notSent and projection defects must pass through real request/lifecycle paths; the
helper exposes no callable reply producer. Its generated observer has the same non-targeting
restrictions and raw binding/action metadata as the production observer.

```ts
import { story } from "flow-state/testing";

const debounceContract = story.fragment(Debounce(300), { id: "debounce-contract" });
const debounceRun = await debounceContract
  .send(debounceContract.E.Input())
  .process()
  .advance(200)
  .process()
  .send(debounceContract.E.Input())
  .process()
  .advance(299)
  .process()
  .checkpoint("before")
  .advance(1)
  .process()
  .checkpoint("after")
  .advance(1000)
  .process()
  .checkpoint("quiet")
  .run();

if (debounceRun.checkpoints.before.calls.onSettled.length !== 0) {
  throw new Error("Debounce fired before the last quiet period");
}
if (debounceRun.checkpoints.after.calls.onSettled.length !== 1) {
  throw new Error("Debounce did not notify once");
}
if (debounceRun.checkpoints.quiet.calls.onSettled.length !== 1) {
  throw new Error("Debounce repeated without another input");
}

const SlowTextServer = Layer.succeed(TextServer, {
  save: (request) => Effect.gen(function* () {
    yield* Effect.sleep(10);
    return { id: request.id, value: request.value.trim() };
  }),
});

const commitContract = story.fragment(CommitWithRetry(2, 1000), {
  id: "commit-contract",
  input: { request: { id: "test-document", value: " x " } },
  operations: { save: SaveText },
  services: ExampleTextServer,
  fixtures: [SlowTextServer],
  props: ({ O }) => ({
    send: ({ reply }) => ({
      actions: [O.save.commit(({ payload }) => payload, {
        outcomes: {
          success: reply.Succeeded.from((receipt) => ({ receipt })),
          failure: {
            Busy: reply.Busy,
            Rejected: reply.Rejected.from((error) => ({ reason: error.reason })),
          },
        },
      })],
    }),
  }),
});

const commitRun = await commitContract
  .process()
  .checkpoint("sending")
  .advance(10)
  .process()
  .checkpoint("done")
  .run();

if (commitRun.checkpoints.sending.calls.send.length !== 1) {
  throw new Error("Entering the fragment did not start its request");
}
if (commitRun.end.exit?.name !== "Done") {
  throw new Error("The fixture-backed request did not complete through its declared exit");
}
```

Required proof inventory (proposed tests, not tests executed by writing Markdown):

| Proof | Concrete expectation |
| --- | --- |
| Terminal totality | Reject reply→raise→guarded child, exit→notify→refused child and timer→notify→refused child at construction; a total unguarded no-op recipient is legal and the terminal is consumed once. |
| Projection closure and phantom replies | A throwing success/error mapper yields one fixed Defected reply and closes that admitted call; invalid admission/reject/second-call attempts create no record and receive no synthetic reply. |
| Departure barrier | Leave invoked A, immediately Review/Open before A settles: Pending is already visible and the guard declines; later success/failure clears it, while unknown/interrupt/defect makes it uncertain and blocks a fresh submit. |
| Attempt safety | A notSent fresh commit can be reviewed again; notSent/interrupt/defect during retry retains the original uncertainty; spoofed or changed Reconcile Attempt data is denied by the ledger guard. |
| Input, read and timer parity | Start sees only the fixed argument used by initial; nested embedded seeds use the same value; lookup can reuse fresh data, live interval affects next arming, old queued timer stamps reject, and every pending read restores interrupt before input. |

The earlier debounce/capture/draft/normalization proofs remain necessary. Public/host-only/privacy
and origin-brand negatives belong to strict type and untyped construction suites. Model retains
Testing O5: a state-fragment recipe with a bootstrap prefix is not command-empty. Use a normal
command-empty host with Begin among candidates for model exploration; do not weaken the plan by
silently skipping initialization. Generated recipe/ordinary-host parity must be demonstrated.

## 5. Against every problem in the round-2 yardstick

There are **34 rows**: 20 original IDs, ten round-1 additions, and L7/L8/H5/E5 this round.
Prevents means a mandatory proposed type/construction/check rule, including generated runtime
identity checks; its implementation still needs proof. By convention means an example's policy,
not a guarantee inferred from arbitrary TS or a handler's mere presence.

| Problem | Verdict | Enforceable scope or limit |
| --- | --- | --- |
| L1 stale timers | **prevents** | Compiled activation and arming ownership invalidate old firings after exit or restart; intended scope choice remains authored policy. |
| L2 late results | **prevents** | Binding/call/activation identity cannot deliver an old result to a later instance or retry occurrence. |
| L3 leftover memory | **prevents** | Fresh activation creates fresh memory; restore is a distinct recorded resume, not entry. |
| L4 no way out | **allows** | Ancestor departure remains available, but a missing business event/opaque guard or defective observer can still block a particular application. |
| L5 abandoned effects | **allows** | Observers retain admitted-call routing and outcomes; preventing all duplicate business commands still requires correct host journal/gates. |
| L6 silent admission | **prevents** | Reject bindings are forbidden, invalid batches publish no wait, and pre-invocation cancellation of an admitted request produces notSent. |
| L7 departure gap | **by convention** | Pending delivery is mandatory and synchronous, and both examples gate on it, but the API cannot prove that an arbitrary host guard consults that journal. |
| L8 phantom replies | **prevents** | Only a successfully admitted registered occurrence can consume a matching producer fact; no reply is invented for reject or failed admission. |
| E1 broken invariants | **allows** | Foreign patches/injected guards reject, but a badly classified indispensable hostEvent can still be withheld by its owner. |
| E2 growing deep interfaces | **allows** | Public nested commands and deep reads are explicit structural compatibility obligations. |
| E3 hidden endings | **prevents** | Callback closure stays inside its emitter's node and completion has a declared exit; explicit ancestor preemption remains ordinary host policy. |
| E4 refusal by forwarding | **allows** | Public Release avoids forwarding, but the library cannot prove the author chose public rather than a host-only command correctly. |
| E5 preempting late handlers | **prevents** | Machine observers cannot target, raise, notify or self-send, so late facts cannot synchronously abandon a newer step. |
| H1 bypassed policy | **allows** | Sender classes are enforced, but public authority may be the wrong business choice for one host. |
| H2 unforeseen checks | **allows** | A new safe refusal point requires changing the fragment contract. |
| H3 faked results | **prevents** | Binding-local nominal origin/class and registered-call checks reject public/raised/foreign reply or exit production. |
| H4 mislabelled outcomes | **allows** | Standard/class remaps reject, but an adapter can still misdescribe an ambiguous remote result as a domain Busy. |
| H5 interrupt as not-sent | **by convention** | Types distinguish notSent and preserve Attempt on interrupt/defect; the examples reconcile, but arbitrary fragment policy could still misuse those facts. |
| D1 drifting copies | **allows** | Live props/passive reads avoid required mirrors; arbitrary host memory can still create them. |
| D2 late live request reads | **by convention** | Operation select cannot reread host memory, while the retry fragment must still choose to resend its fixed captured command. |
| D3 feedback loops | **by convention** | AutoSave emits quiet input only on edits, but no general type rule proves arbitrary edit/normalization causality. |
| D4 unmapped outcomes | **prevents** | Full declared reply coverage, terminal totality, fixed system kinds and a single unprojected defect fallback prevent silent suppressed terminal delivery. |
| D5 restore in flight | **prevents** | Outstanding call/Attempt/observer records are mandatory and reads restore interrupt rather than waiting for nonexistent resumed execution. |
| D6 same-turn seeding | **prevents** | Incoming input is the sole staged read; initial/start/child input consume that same fixed value without fresh memory views. |
| D7 lost drafts | **allows** | Examples checkpoint/carry drafts; generic data meaning is only recognizable enough for advisory warnings. |
| A1 forwarding compounds | **allows** | Public routes compose directly; deliberately private protocols across several owners still need explicit relays. |
| A2 split input/ending blocks | **allows** | Props and exit maps remain distinct within the same named placement, with graph links rather than another umbrella API. |
| A3 conditional rules | **allows** | One constructor still has two refined kinds and their legal fields; the cost is explicit. |
| A4 overloaded vocabulary | **by convention** | Notify separates finite actions from synchronous composition, input means capture and counts are explicit, but readability is not a compiler theorem. |
| A5 fragment I/O | **prevents** | Raw fragment operations/actions reject; requests/relays terminate at one machine-owned operation. |
| A6 late silence | **prevents** | Required bindings, total terminal chains and declared variants are checked; optional no-ops are explicit and projection suppression becomes defect. |
| A7 forgotten first send | **by convention** | Declared start runs once and empty reply-only waits flag, but intended initial work cannot always be inferred. |
| T1 partial turns | **prevents** | Ordinary required raises are atomic and terminal chains are statically total, so neither a partial source commit nor a stranded consumed terminal is legal. |
| T2 schedule baseline traps | **allows** | RestartOn stays idle on entry and cannot infer dirty intent; Poll uses explicit start and AutoSave documents retained unsent drafts. |

No prevents row claims truthful remote adapters, total arbitrary user functions or universal
business progress. The explicit sample Pending guards close the review's A/B lost-update trace;
the generic API supplies the mechanism without pretending to synthesize business authorization.

## 6. Flow check, graph and verification limits

**Flow check mirrors R1–R28 for untyped callers and validates the same compiled structure as
construction.** This includes kind/fields, sender/target authority, schemas, required bindings,
exit/reply coverage, origin/class brands, exact operation kinds, defaults/input/start rules,
observer presence/restrictions, duplicate names and all static ownership rules. The same stable
rule/path diagnostics apply without inventing another 28 “rules” in a second table.

Additional analyses and evidence, beyond mirroring field/type errors:

| Analysis | Concrete result |
| --- | --- |
| Terminal producer closure | Start from every reply, exit continuation and schedule send; expand notify/raise edges and error on any reachable guarded-only, unhandled or absent recipient, including timer notifications. |
| Outstanding-call abstract state | Explore control path × per-port outstanding state with guards nondeterministic; error on proved orphan waits/duplicate issue or invalid terminal ownership, warn when payload predicates prevent proof. |
| Admission provenance | Verify every terminal producer consumes exactly one registered action occurrence from its stamped binding; reject forged/unadmitted/wrong-occurrence paths and reject-concurrency request bindings. |
| Departure coverage | Enumerate every owner/ancestor/re-entry/relay leave edge with admitted commits and require a root observer Pending source before publication, including a terminal already queued for that owner. |
| Observer metadata/ownership | Check binding path/action kind/Attempt association and root-only non-targeting effects; batched Pending handlers and multiple operation observers must have disjoint source patch ownership. |
| Same-turn conflicts | Error on producer cycles, target incompatibility, escaping callback closure, known overlapping patches, InactiveRequestOwner and expansion beyond 10,000 transitions; opaque key sets warn and still undergo atomic conflict rejection before publication. |
| Restore/arming integrity | Validate compatible schemas, call/Attempt/observer identities, never-invoked proof for notSent, mandatory pending-read interrupt and timer activation/arming stamps. |
| Advisory checks | Warn about possible local-data loss, ignored recovery data, likely missing submission gates, unmatched public policy, no escape from a nonterminating step, outcome-only mirrors and silent restartOn baseline misuse; never certify arbitrary callback intent. |

Graph can collapse/expand instances while retaining one active-leaf tree; show public versus
host/private producers, notify edges separately from post-publication actions, fixed-input entry
and start ports, exact request/reply kinds, relays, timer arming ownership and non-targeting
operation observers. Departure Pending is on the leaving edge, not a later timer. Projection
failure shows the fixed defect edge; it is not a disappeared business result. Explain follows
mapped pre-turn guard inputs without a reducer dry-run. Missing type facts yield incomplete/failed
analysis rather than invented certainty. No new CLI flag is required.

Warnings do not prove that an observer stores the correct data or that Submit checks it. Arbitrary
function purity, remote idempotency, feedback-loop freedom, data meaning and eventual completion
remain executable proof obligations. None of the proposed runtime/type proofs has been run here.

## 7. Changes, plan cost and weaknesses

| Comparison | Current change |
| --- | --- |
| [proposal.md](../proposal.md) | One constructor with a fixed kind, fragment-declared senders, Schema props, lexical request kinds, fixed system replies, one observer per operation and fixed-input start. |
| [fragments.md](../../fragments.md) §13–14 | Keep ownership/nesting/safe declared guards/exits/no fragment I/O; replace D12–D13's two function names with a discriminated grammar and replace host-only public forwarding with direct declared public paths. |
| Round 1 of this file | Notify replaces callback actions; target-only exits; per-operation batched observation replaces forwarding events; one Story driver namespace; no empty declarations; start/child initializers no longer read fresh memory; Pending/notSent/defect closure close the new correctness gaps. |

Plan amendments, which this exploration does **not** apply:

| Plan | Required amendment |
| --- | --- |
| Machines O1–O4 | New fragment/sender/owner grammar, child-only hostEvent raise, distinct notify, canonical exits, fixed-input initialization/start, no input/start default paths, total terminal chains, composed check and one operation observer with a synchronous departure phase; fragment input may seed children without a dummy local memory field. |
| Operations O2/O3/O7 | Request-bound origin-specific delivery/observation is the later-state delivery exception; actual admission creates authority, reject request bindings forbid phantom replies, admitted pre-invocation cancel produces notSent, interrupt/defect retain Attempt, suppressed projection yields exactly one fixed defect. Ordinary non-request outcomes remain unchanged. |
| Runtime / Persistence / SSR | Durable call/Attempt/observer/arming associations; Pending before departure/input admission; restore known/notSent/unknown according to proof, reads interrupt and no initial/start replay; compatible fragment/codec shapes affect hydration identity. |
| Testing | One generated Story entry/driver and real fixtures, with production-binding parity; no privileged reply injection or silent command-empty-model exception. |
| Inspection / CommandLine / Package | New producer/phase/observer metadata and rule diagnostics, complete type facts and the fragment root export. New diagnostics use registered code/reason vocabularies. |

Correctness comes from explicit authority/admission/terminal mechanisms. Readability improves by
separating notify from actions and centralizing departure bookkeeping, not by claiming every
failure has disappeared. Brevity improves at placements; the retained features and recovery
protocol still have a substantial data model. The public surface count is reported inclusively.

Remaining weaknesses:

1. Single constructor still teaches two kinds. Kind is retained for the assigned shape; split
   wrappers could be more discoverable without changing runtime semantics.
2. Direct public paths/deep reads expose structure, while private nested protocols still need
   explicit relays. The host cancellation checkpoint is intentionally coupled to field memory.
3. Business gates remain authored. Pending routing is enforced; consulting pending/uncertain,
   retaining meaningful drafts and correctly classifying domain Busy are not universally provable.
4. Ordinary transition read rules are simpler now, but incoming input still has a staged parent
   read and operation observers add a required departure phase. Both need atomicity/restore proofs.
5. Required Schema/fixture/metadata support costs code and type-instantiation work. The complete
   examples need strict packed-consumer type tests and runtime parity before acceptance.

## 8. Possible cuts

**No cut below is applied.** These are the simplicity audit's ranked cuts for this proposal,
with correctness §8.3's corrections. They require a user decision, unlike no-loss spelling drops.

| Rank | Possible cut | What gets simpler | Use cases that break / required substitute | Problems or losses reopened |
| --- | --- | --- | --- | --- |
| 1 | Live fragment.prop | Remove the live-value descriptor/selection rule. | Poll cannot read a changed host interval directly; pagination/limits/host settings need pushed snapshots. | D1: push-based copies can drift; dropping live values is now a real feature loss shown by Poll. |
| 2 | Only the lookup request kind, keep refetch | One fewer request action kind and cache-aware startup choice. | Initial verify/poll reads must force refetch or be moved to a host activity rather than use fresh data. | D4 for lookup-owned replies; if this becomes an all-read-request cut, also H3/H4, L2 and D5 for reads, as §8.2/8.3 warn. |
| 3 | Request relay / nested correlation | Fewer nested generation/observer/persistence paths. | A wizard/step cannot pass a child's I/O contract up unchanged; every wrapper rebuilds reply and departure adaptation or exposes the child. | A5 and A1 at depth, plus **H3/H4 at depth and L5-at-depth** from hand-written result/abandonment mapping; the original audit understated these. |
| 4 | Story.fragment | Remove generated driver/recorders and parity obligations. | Dedicated standalone recipes disappear; authors write explicit ordinary host Stories and their recorders. | Principle 10 ergonomics/coverage; ordinary manual isolated testing remains possible, at higher cost. |
| 5 | Same-turn composition | Remove raise fusion, notify target composition, cycle/conflict/decline/check expansion. | DebounceHost forwarding/idle→SETTLED and atomic host-fed replace/reset/confirmed normalization require later events or flattening; direct AutoSave timer alone would survive. | H1/A1; **D3** for confirmed Replace/Set routes, and **E4** if public routes are replaced by forwarding; the audit understated both. Synchronous Pending bookkeeping still cannot simply be deleted. |
| 6 | Request ports entirely | Remove the largest authority/correlation/terminal protocol and most request checks. | Host maps operation outcomes into fragment commands again; reusable retry/read/reconcile protocols need bespoke fences and exhaustive adapters. | D2/D4, L2/L5/L6/D5, H3/H4/**H5**, plus L7/L8 and A7 migrate into manual host code; dropping the vocabulary does not remove these obligations. |

Two broader cross-audit cuts have especially easy-to-understate losses. Removing **start** returns
first-send ownership to the host, reopening A7/D2 and **L8**, because one outstanding check spans
two owners. Forbidding **departure during a commit** closes L7 by blocking departure, but a hung
adapter then reopens **L4 fully**; post-invocation cancel still produces unknown and still needs
an after-departure route. It therefore does not remove the whole abandoned protocol. Removing all
nested state fragments would simplify that protocol, but breaks the checkout→address composition
explicitly requested here. None of these broader cuts is applied either.

## Revision log (round 1)

Historical receipt: this records the round-1 decisions, not the current API. Round-2 rules and
log supersede its start/observer/admission/projection details.

Sources: [correctness review, §5–7](reviews/round1-correctness.md) and
[principles review, §3 and §6](reviews/round1-principles.md). Brief borrowing credits are in the
individual rules; this log records every assigned finding, including rejections.

| Finding | Disposition and change |
| --- | --- |
| Correctness B1: abandoned unknown preempts a newer step | **Fixed.** All observers require target self, no guards/raises and no state overrides; A/B outcomes update plural ledgers without moving B. |
| Correctness M1: abandoned success disappears | **Fixed.** Optional abandoned.success plus a missing-route warning; both transaction hosts record late success without overwriting a current draft. |
| Correctness M2: unknown/failure can be labelled success/Busy | **Fixed for typeable kinds.** Grouped success/failure tokens are nominal; compiler owns unknown/interrupt/defect names and preserves Attempt. Adapter/domain misclassification remains allowed and H4 says so. |
| Correctness M3: FAILED never saves again and Close drops draft | **Fixed.** FAILED handles the next quiet Flush; close checkpoints the latest draft and uncertain exits carry it; saved replies no longer raise a possibly-unhandled Flush. |
| Correctness M4: TextField initial reads live props | **Fixed.** Required input.start, embedded input bindings at every use, initial receives only input; nested input is demonstrated through both levels. |
| Correctness M5 / principles 3: partial raise and misleading check | **Fixed.** Any required recipient refusal/unhandled input declines the whole source alternative; check expands the same pre-turn guard chain and preserves inner reasons. |
| Correctness m1 / principles 2: zero-delay first send | **Changed.** Accepted principles' start recommendation despite correctness calling the timer acceptable: entering transition appends fragment-owned requests, no READY/timer, no default/admission/restore replay. |
| Correctness m2: InactiveRequestOwner absent from check semantics | **Fixed.** Structural check explicitly rejects/throws for that invalid combination rather than returning Allowed; untyped handling rejects before publication. |
| Correctness m3: special root shadowing conflicts with leaf-first lookup | **Clarified.** Listed root-exclusive observer declarations as an explicit Machines amendment; invalid overrides reject at authoring, and runtime lookup still remains leaf-first. |
| Correctness m4: UNCERTAIN dead end | **Fixed.** ReconcileText binds operation retry with the original Attempt; both hosts expose a user reconciliation command, remove only resolved ledger entries and retain pending ones. |
| Principles 1: premise/shape argument and “either” placement | **Fixed argument, retained assigned shape.** Accepted the two concepts, added required kind and nominal placement checking, and removed the false nesting argument; one constructor is a shared grammar, not a lifecycle advantage. Split function names are not adopted in this single-constructor proposal. |
| Principles 4: events meaning changes / whole-child exposure | **Fixed.** Borrowed opus-split's public events, hostEvents and internalEvents; removed exposes entirely, with automatic public namespacing and no host interception. |
| Principles 5: embedded callbacks cannot move host | **Fixed.** Borrowed opus-single's owning-node target rule; DebounceHost actually targets SETTLED. Own private raises are also allowed, but cannot indirectly escape a state callback's boundary. |
| Principles 6: standalone test requires hand-written host | **Fixed.** Added generated story.fragment with ordinary public drivers, callback/request/exit observations and service Layer fixtures, crediting sonnet-single/reviewer synthesis; no direct reply injection. |
| Principles 7: second replies table / undefined vocabulary | **Fixed.** Replies are private on keys with ordinary event data; removed staged reductions/return-route vocabulary in favour of one pre-turn combined transition and explicit correlation records. |
| Principles 8: two entry input sources | **Fixed.** Borrowed sonnet-split's no-input-bearing-default rule, extended to start-bearing instances; there is one transition input source, not a default fallback selector. |
| Principles 9: hosts repeat all system outcome maps | **Fixed.** Borrowed opus-split's division: host projects success/domain tags; fragment declares system kinds and compiler routes them. |
| Principles 10: optional allow-by-default guard | **Rejected.** Kept required guards and explicit () => true: a security/admission capability should be reviewed at each placement; omitted optional notification/value props have a different consequence. This costs a small binding per host. |
| Cross-proposal same-turn input and pre-turn conflict | **Fixed narrowly.** Input sees post-patch parent memory plus event/exit payload; all guards/ordinary action parameters retain pre-turn semantics. Staged-memory microsteps were dropped, not retained as an unexplained O3 exception. |
| Cross-proposal Operations O2 / persistence gaps | **Fixed specification.** Explicit O2/O3 later-state-delivery exception, declined admission→interrupt, pending read→interrupt restore, durable generation/Attempt association and no start replay are listed as required plan changes. |
| Cross-proposal E4, L5, L6, H4, D5–D7, A7, T1, T2 | **Added all ten rows.** E4/H4/D7/L5 and schedule/first-send intent do not get blanket prevents claims; D2/D3/A4 are relabelled by convention, and all 30 rows state their enforceable scope. |
| Cross-proposal pure-function/static-analysis limits | **Kept and tightened.** Check never runs updates or solves arbitrary guards; exact reply/action/owner errors are separated from advisory data-loss, liveness and restartOn findings. |

No reviewer instruction was treated as authority to change a plan, implement the runtime, edit
another proposal or commit. The retained single constructor and required guard policy are the
explicit departures from the principles review's preferred surface. The revision also rejects
privileged test reply injection and unrestricted entry actions because neither is needed for the
shown use cases and both widen existing plan changes.


## Revision log (round 2)

Read: [correctness §5, §7 and all of §8](reviews/round2-correctness.md),
[principles §3 and §7](reviews/round2-principles.md), and
[simplicity §3 and §7](reviews/round2-simplicity.md). Round-1 text above is a historical receipt;
R1–R28 and this log own the current proposal.

| Finding / audited item | Disposition and concrete change |
| --- | --- |
| Correctness M1: departure gap / L7 | **Fixed in both examples.** Borrowed codex-split's synchronous Pending fact; the root operation observer records admitted writes in the departure publication, and Review/Open/Reconcile guard on pending before settlement. Generic L7 stays by convention because arbitrary host gates are not provable. |
| Correctness m1: interrupted/defective abandoned commits lose Attempt | **Fixed.** Both facts retain the exact Attempt and move pending to uncertain; the operation observer covers commit and retry and knows the binding/action kind. |
| Correctness m2: autosave resubmits after adapter interrupt | **Strengthened.** Chose conservative generic semantics even though whole-document overwrite could tolerate it: interrupt/defect exit with Attempt plus draft and require retry of that same Attempt, rather than a fresh quiet-period commit. Only notSent guarantees safe non-invocation. |
| Correctness m3: throwing input lookup | **Fixed.** Reconcile carries an Attempt; the guard compares it against the ledger with Effect Equal.equals and checks pending, while the input mapper reads only event.attempt. Removed requireAttempt. |
| Principles must-fix 1: consumed terminal may decline | **Fixed.** One R14 totality rule covers every reply/exit/timer and transitive notify/raise, including static receiver presence and unguarded fallbacks; slot retirement is coupled to accepted terminal delivery. Borrowed codex-split and extended its timer coverage. |
| Principles shared projection defect gap | **Fixed.** An admitted request with a throwing/invalid outcome projection gets one unprojected fixed defect event (Attempt for writes); no dead port waiting for re-entry. Operation evidence preserves the real settlement; defective fallback handlers remain visible user-code defects. |
| Principles must-fix 2: callbacks mixed with finite actions | **Fixed; confirmed no-loss drop.** Notification calls are in notify and have no action-time now signature; actions remain post-publication finite work. Machines O3 amendment is explicit. |
| Principles must-fix 3: three memory snapshots | **Fixed.** Only incoming input reads staged parent memory; start is a port→fixed-input mapper and embedded child input receives that same fixed input, not fresh local memory. AddressStep no longer stores a dummy seed. |
| Principles must-fix 4: vocabulary / input roles / exit spellings | **Fixed.** One flat E driver, target-only exits, one fixed-capture meaning for input and a complete counted ledger. The round-1 claim that return-route vocabulary had all disappeared was too strong; current mechanics are defined as call identity/correlation rather than relying on that claim. |
| Principles must-fix 5: unused live prop and lookup | **Demonstrated, not cut.** Poll starts a cache-aware lookup, retains refetch for polling and reads a live interval prop at the next schedule arming. |
| Principles minor: impossible failure replies | **Kept deliberately.** ReadReplies still declares/handles Failed for reuse with fallible adapters; Heartbeat's E=never removes only its host mapping. Correctness §8.3 says deleting handlers reopens D4/A6. |
| Principles minor: public-event entry wording | **Corrected.** Entry may be a public transition or an exit continuation; start is attached to either accepted entry and still forbidden on default/admission/restore paths. |
| No-loss kind→two constructors | **Not applied: direct conflict with the assigned single shape.** Retained kind and its two nominal placement results, with no claim of runtime advantage over two wrapper names. |
| No-loss one exit spelling | **Applied.** Every fragment completion in every code sample is target: exits.Name or target: exits.Name.from; no bare whole-transition exit remains. |
| No-loss merged abandoned observer | **Applied with all conditions.** One machine observer per operation, no target/guard/raise/notify/self-send; each fact identifies binding plus commit/retry action, and Pending remains synchronous. A batch avoids repeated writes when several same-operation calls depart together. |
| No-loss merge Story namespaces | **Applied.** One E namespace with reserved/escaped controls, identical production request bindings and a generated operation observer, not a special omitted per-port fallback form. |
| Proposed guard().optional drop | **Rejected as required by §8.3's correctness veto.** It silently grants permission and reopens A6/H1; required guards remain explicit at placements. |
| Cross no-loss public raise route / callback rule / optional forms | **Applied.** Raises only enter direct child hostEvents; public inputs arrive directly, callbacks share one owning-node rule and optional applies only to values/notifications. AutoSave uses one own restartOn timer instead of a self-raised callback dispatch. |
| Cross no-loss terminal rule / check mirrors / empty declarations | **Applied with conditions.** R14 includes transitive reply/exit/timer effects; check mirrors the canonical rules for untyped construction; empty declarations are implied only because kind remains explicit. |
| L8 / reject reply fabrication | **Fixed.** Borrowed codex-split's reject-binding prohibition and origin/consumption-path checks; failed admission registers no wait and generates no terminal reply. An admitted pre-invocation cancel has a real call and closes as notSent. |
| H5 / guaranteed non-invocation | **Fixed distinction, honest policy limit.** Borrowed opus-split's notSent separation, carrying Attempt for admitted transaction calls; interrupt/defect retain uncertainty and a cancelled retry cannot clear its original write's uncertainty. |
| Timer queued before restart | **Added.** Borrowed codex-split's arming identity, alongside activation/call identity; a stale queued firing is not a current delivery. |
| New yardstick E5/L7/H5/L8 | **Added all four.** E5 and L8 have enforced authority/admission checks; L7 and H5 retain by-convention verdicts for user-authored gates/policies despite the corrected examples. |
| Feature-cut audit | **No cut applied.** Added Possible cuts with all six ranked proposal cuts, including H3/H4/L5 at depth for relay removal, D3/E4 for composition removal and the additional H5/L7/L8 manual obligations if requests go; broader start/departure losses include full L4 for hung adapters and continuing unknown routing. |
| Counts / clarity | **Reported explicitly.** 29 authoring/Story keywords/new roles, 12 separately counted reserved protocol-data roles/tags, 41 inclusive; 28 canonical rules. The audit's rough 34 and 60–70 are not presented as an exact baseline for a fabricated reduction. |

Kept single fragment, required guards, all declared reply handlers, live props, both read kinds,
relays, generated Stories, start, departure and same-turn composition. Only this proposal is
edited. No plan is changed, no runtime is implemented and no commit is authorized or made.
