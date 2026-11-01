# Fragment examples by use case

The catalogue for [fragments.md](fragments.md): the one place that holds the full code of each
fragment. Each example is small and shows one idea. The API is proposed, not built; every example
follows the rules in fragments.md section 7. Imports (`fragment`, `prop`, `callback`, `deny`,
`check`, `Schema`, `Duration`, `Equal`) are omitted.

Conventions:

- `fragment(contract, build)`. The contract declares events, memory, states and props; `build`
  returns handlers like a machine. Every handler has a target (`"self"` or one of the fragment's
  states).
- Value props are `prop<T>()` (or `prop.optional<T>()`); callback props are `callback<P>()`. The
  fragment reads `({ props })` and calls `props.onX` or `props.onX.from(f)` in `actions`.
- The host's definition places a fragment (mounted in `states`, embedded in `embeds`); the host's
  machine binds props and guards under the same name. In a callback handler the callback's data is
  `payload`; a handler without a target keeps the fragment's target, and a handler that targets a
  host state ends the mount.
- A callback that cannot end a mount may be left unbound; calling it then does nothing (open
  question 2 in fragments.md).

## 1. Switches and small UI state

**Toggle**

```ts
export const Toggle = (p: { initial: boolean }) =>
  fragment(
    {
      id: "Toggle",
      events: { Toggle: {}, Set: { on: Schema.Boolean } },
      memory: { on: Schema.Boolean },
      initial: () => ({ on: p.initial }),
    },
    () => ({
      on: {
        Toggle: { target: "self", updateMemory: ({ memory }) => ({ on: !memory.on }) },
        Set: { target: "self", updateMemory: ({ event }) => ({ on: event.on }) },
      },
    }),
  );
```

**Cycle through levels.** Orthogonal, so the phase lives in memory:

```ts
export const Cycle = <const L extends string>(levels: readonly [L, ...L[]]) =>
  fragment(
    {
      id: "Cycle",
      events: { Next: {} },
      memory: { index: Schema.Int },
      initial: () => ({ index: 0 }),
    },
    () => ({
      on: {
        Next: {
          target: "self",
          updateMemory: ({ memory }) => ({ index: (memory.index + 1) % levels.length }),
        },
      },
    }),
  );
export const levelOf = <L extends string>(levels: readonly [L, ...L[]], m: { index: number }): L =>
  levels[m.index % levels.length]!;
// embeds: { fan: Cycle(["off", "low", "high"]) }
```

**Stepper with bounds.** The deny codes disable the buttons through `check()`:

```ts
export const Stepper = (p: { min: number; max: number; start: number }) =>
  fragment(
    {
      id: "Stepper",
      events: { Up: {}, Down: {} },
      memory: { value: Schema.Number },
      initial: () => ({ value: p.start }),
    },
    () => ({
      on: {
        Up: {
          target: "self",
          guard: ({ memory }) => memory.value < p.max || deny("AtMax"),
          updateMemory: ({ memory }) => ({ value: memory.value + 1 }),
        },
        Down: {
          target: "self",
          guard: ({ memory }) => memory.value > p.min || deny("AtMin"),
          updateMemory: ({ memory }) => ({ value: memory.value - 1 }),
        },
      },
    }),
  );
// view: check(snapshot, Order.E.qty.Up())._tag === "Denied" disables the + button
```

**Flash.** "Copied" for two seconds; showing again extends it:

```ts
export const Flash = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Flash",
      events: { Show: {} },
      internalEvents: { Hide: {} },
      memory: { shows: Schema.Int, visible: Schema.Boolean },
      initial: () => ({ shows: 0, visible: false }),
    },
    ({ E }) => ({
      // restartOn selects a counter, so every Show restarts the timer and Hide never does
      schedules: {
        hide: { schedule: p.for, send: E.Hide, restartOn: ({ memory }) => memory.shows },
      },
      on: {
        Show: {
          target: "self",
          updateMemory: ({ memory }) => ({ shows: memory.shows + 1, visible: true }),
        },
        Hide: { target: "self", updateMemory: () => ({ visible: false }) },
      },
    }),
  );
```

## 2. Forms and editing

**Field.** Validated from the start, so an untouched required field is invalid:

```ts
export const Field = <V>(
  value: Schema.Codec<V>,
  p: { empty: V; validate: (v: V) => string | null },
) =>
  fragment(
    {
      id: "Field",
      events: { Changed: { value }, Set: { value }, Blurred: {} }, // Changed: the user; Set: the host, silently
      memory: { value, touched: Schema.Boolean, error: Schema.NullOr(Schema.String) },
      initial: ({ props }) => {
        const start = props.start ?? p.empty;
        return { value: start, touched: false, error: p.validate(start) };
      },
      props: { start: prop.optional<V>(), onChanged: callback<{ value: V }>() },
    },
    ({ props }) => ({
      on: {
        Changed: {
          target: "self",
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
          actions: [props.onChanged.from(({ event }) => ({ value: event.value }))],
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

**A form from fields.** The host adds only the submit rule:

```ts
definition({
  id: "Signup",
  states: [
    "FILLING",
    { SUBMIT: CommitWithRetry(User, { maxRetries: 2, backoff: "1 second" }) },
    "DONE",
  ],
  embeds: {
    email: Field(Schema.String, {
      empty: "",
      validate: (v) => (v.includes("@") ? null : "Not an email"),
    }),
    password: Field(Schema.String, {
      empty: "",
      validate: (v) => (v.length >= 12 ? null : "Too short"),
    }),
  },
  events: { Submit: {} },
  // …
});
// machine: FILLING: { on: { Submit: { target: S.SUBMIT, guard: ({ memory }) => (isValid(memory.email) && isValid(memory.password)) || deny("Invalid"), actions: [createUser] } } }
```

**Draft against a confirmed value.** Server values never overwrite local edits:

```ts
export const Draft = <V>(value: Schema.Codec<V>, p: { empty: V }) =>
  fragment(
    {
      id: "Draft",
      events: { Changed: { value }, Discard: {} },
      internalEvents: { Confirmed: { value } },
      memory: { draft: value, saved: value },
      initial: () => ({ draft: p.empty, saved: p.empty }),
    },
    () => ({
      on: {
        Changed: { target: "self", updateMemory: ({ event }) => ({ draft: event.value }) },
        Confirmed: {
          target: "self",
          updateMemory: ({ event, memory }) =>
            isDirty(memory) ? { saved: event.value } : { saved: event.value, draft: event.value },
        },
        Discard: {
          target: "self",
          guard: ({ memory }) => isDirty(memory) || deny("NothingToDiscard"),
          updateMemory: ({ memory }) => ({ draft: memory.saved }),
        },
      },
    }),
  );
export const isDirty = <V>(m: { draft: V; saved: V }) => !Equal.equals(m.draft, m.saved);
// host: the confirmed server value is mapped onto the internal event
//   activities: { ticket: O.Tickets.ticketById.subscribe(key, { outcomes: { value: E.title.Confirmed.from((t) => ({ value: t.title })) } }) }
```

**Undo over a field.** `past` holds the values each change replaced; the restored value comes
from the pre-turn snapshot, so popping it in the same transition is safe:

```ts
export const Undo = <V>(value: Schema.Codec<V>) =>
  fragment(
    {
      id: "Undo",
      events: { Undo: {} },
      internalEvents: { Record: { value } },
      memory: { past: Schema.Array(value) },
      initial: () => ({ past: [] }),
      props: { onRestore: callback<{ value: V }>() },
    },
    ({ props }) => ({
      on: {
        Record: { target: "self", updateMemory: ({ event, memory }) => ({ past: [...memory.past, event.value].slice(-50) }) },
        Undo: {
          target: "self",
          guard: ({ memory }) => memory.past.length > 0 || deny("NothingToUndo"),
          updateMemory: ({ memory }) => ({ past: memory.past.slice(0, -1) }),
          actions: [props.onRestore.from(({ memory }) => ({ value: memory.past.at(-1)! }))],
        },
      },
    }),
  );

// host: before each user change, record the value it replaces (read from the pre-turn snapshot);
// restore silently with Set so the restore is not recorded again
embeds: {
  title: { props: { onChanged: { raise: [E.history.Record.from(({ memory }) => ({ value: memory.title.value }))] } } },
  history: { props: { onRestore: { raise: [E.title.Set.from(({ payload }) => ({ value: payload.value }))] } } },
},
```

## 3. Async work

**CommitWithRetry.** The host sends; the fragment decides when to retry and how it ends:

```ts
export const CommitWithRetry = <V>(
  value: Schema.Codec<V>,
  p: { maxRetries: number; backoff: Duration.Input },
) =>
  fragment(
    {
      id: "CommitWithRetry",
      states: ["SENDING", "WAITING"],
      events: { Cancel: {} },
      internalEvents: {
        Succeeded: { value },
        Busy: {},
        Rejected: { reason: Schema.String },
        Uncertain: {},
        RetryDue: {},
      },
      memory: { retries: Schema.Int },
      initial: () => ({ retries: 0 }),
      props: {
        onSend: callback(), // called for every retry; the first send is the host's transition into the mount
        onDone: callback<{ value: V }>(),
        onFailed: callback<{ reason: string }>(),
        onUncertain: callback(),
        onCancel: callback(),
      },
    },
    ({ S, E, props }) => ({
      default: S.SENDING,
      on: { Cancel: { target: "self", actions: [props.onCancel] } },
      states: {
        SENDING: {
          on: {
            Succeeded: {
              target: "self",
              actions: [props.onDone.from(({ event }) => ({ value: event.value }))],
            },
            Rejected: {
              target: "self",
              actions: [props.onFailed.from(({ event }) => ({ reason: event.reason }))],
            },
            Uncertain: { target: "self", actions: [props.onUncertain] },
            Busy: [
              {
                target: S.WAITING,
                guard: ({ memory }) => memory.retries < p.maxRetries || deny("RetryLimitReached"),
                updateMemory: ({ memory }) => ({ retries: memory.retries + 1 }),
              },
              {
                target: "self",
                actions: [
                  props.onFailed.from(({ memory }) => ({
                    reason: `gave up after ${memory.retries} retries`,
                  })),
                ],
              },
            ],
          },
        },
        WAITING: {
          schedules: {
            backoff: {
              schedule: ({ memory }) => Duration.times(p.backoff, 2 ** memory.retries),
              send: E.RetryDue,
            },
          },
          on: { RetryDue: { target: S.SENDING, actions: [props.onSend] } },
        },
      },
    }),
  );
```

The host binding, with every outcome mapped (including `unknown`, required for restore):

```ts
const commitTitle = O.Tickets.saveTitle.commit(titleInput, {
  outcomes: {
    success: E.SAVE.Succeeded.from((ticket) => ({ value: ticket })),
    failure: { TicketLocked: E.SAVE.Busy, TitleRejected: E.SAVE.Rejected.from(({ reason }) => ({ reason })) },
    unknown: E.SAVE.Uncertain,
  },
});

EDITING: { on: { SaveRequested: { target: S.SAVE, guard: canSave, actions: [commitTitle] } } },
SAVE: {
  props: {
    onSend: { actions: [commitTitle] },
    onDone: { target: S.SAVED, actions: [toastSaved] },
    onFailed: { target: S.FAILED, updateMemory: ({ payload }) => ({ error: payload.reason }) },
    onUncertain: { target: S.UNCERTAIN },
    onCancel: { target: S.EDITING, actions: [O.Tickets.saveTitle.cancel(ticketKey)] },
  },
},
```

**AutoSave.** Seeded from the host. It saves a quiet period after the last edit, only when the
server copy has not moved underneath, and keeps saving edits made while a save was running:

```ts
export const AutoSave = <V>(value: Schema.Codec<V>) =>
  fragment(
    {
      id: "AutoSave",
      states: ["CLEAN", "DIRTY", "SAVING", "FAILED"],
      events: { Changed: { value }, Close: {} },
      internalEvents: { Due: {}, Succeeded: { value }, Rejected: { reason: Schema.String }, Uncertain: {} },
      memory: { draft: value, saved: value },
      initial: ({ props }) => ({ draft: props.loaded, saved: props.loaded }),
      props: {
        loaded: prop<V>(), // the value the host opened
        server: prop<V>(), // the server's current value
        delay: prop<Duration.Input>(),
        onSave: callback<{ value: V }>(),
        onSaved: callback<{ value: V }>(),
        onFailed: callback<{ reason: string }>(),
        onClose: callback(),
      },
    },
    ({ S, E, props }) => ({
      default: S.CLEAN,
      on: {
        // an edit (re)enters DIRTY, which restarts its timer: a debounce
        Changed: { target: S.DIRTY, updateMemory: ({ event }) => ({ draft: event.value }) },
        Close: { target: "self", actions: [props.onClose] },
      },
      states: {
        CLEAN: {},
        DIRTY: {
          schedules: { autosave: { schedule: ({ props }) => props.delay, send: E.Due } },
          on: {
            Due: {
              target: S.SAVING,
              guard: ({ props, memory }) => Equal.equals(props.server, memory.saved) || deny("ChangedOnServer"),
              actions: [props.onSave.from(({ memory }) => ({ value: memory.draft }))],
            },
          },
        },
        SAVING: {
          on: {
            // edits during a save are kept; the outcome decides whether more saving is needed
            Changed: { target: "self", updateMemory: ({ event }) => ({ draft: event.value }) },
            Succeeded: [
              {
                target: S.CLEAN,
                guard: ({ event, memory }) => Equal.equals(event.value, memory.draft) || deny("DraftMovedOn"),
                updateMemory: ({ event }) => ({ saved: event.value }),
                actions: [props.onSaved.from(({ event }) => ({ value: event.value }))],
              },
              { target: S.DIRTY, updateMemory: ({ event }) => ({ saved: event.value }), actions: [props.onSaved.from(({ event }) => ({ value: event.value }))] },
            ],
            Rejected: { target: S.FAILED, actions: [props.onFailed.from(({ event }) => ({ reason: event.reason }))] },
            Uncertain: { target: S.FAILED, actions: [props.onFailed.from(() => ({ reason: "The save may not have completed" }))] },
          },
        },
        FAILED: {}, // the next edit enters DIRTY again through the root handler
      },
    }),
  );

// host: the note subscription is a host activity on an ancestor of NOTE
const saveNote = O.Notes.save.commit(({ memory, payload }) => ({ ...noteKey({ memory }), body: payload.value }), {
  outcomes: {
    success: E.NOTE.Succeeded.from((note) => ({ value: note.body })),
    failure: { ValidationFailed: E.NOTE.Rejected.from((e) => ({ reason: e.message })) },
    unknown: E.NOTE.Uncertain,
  },
});
NOTE: {
  props: {
    loaded: ({ memory }) => memory.body,
    server: ({ activities, memory }) => activities.note?.data?.body ?? memory.body,
    delay: ({ memory }) => memory.prefs.autosaveDelay,
    onSave: { actions: [saveNote] },
    onSaved: { actions: [toastSaved] },
    onFailed: { updateMemory: ({ payload }) => ({ error: payload.reason }) }, // stays in the mount
    onClose: { target: S.LIST },
  },
  guards: { Due: ({ context }) => context.canEdit || deny("ReadOnly") },
},
```

**Debounce.** Fires once, the given time after the last input:

```ts
export const Debounce = (p: { wait: Duration.Input }) =>
  fragment(
    {
      id: "Debounce",
      events: { Input: {} },
      internalEvents: { Due: {} },
      memory: { seq: Schema.Int },
      initial: () => ({ seq: 0 }),
      props: { onSettled: callback() },
    },
    ({ E, props }) => ({
      // every Input changes seq and restarts the timer; Due changes nothing, so it fires once
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

**Cooldown.** "Resend code" is disabled for 30 seconds after each use:

```ts
export const Cooldown = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Cooldown",
      events: { Use: {} },
      internalEvents: { Ready: {} },
      memory: { uses: Schema.Int, cooling: Schema.Boolean },
      initial: () => ({ uses: 0, cooling: false }),
      props: { onUse: callback() },
    },
    ({ E, props }) => ({
      schedules: {
        ready: { schedule: p.for, send: E.Ready, restartOn: ({ memory }) => memory.uses },
      },
      on: {
        Use: {
          target: "self",
          guard: ({ memory }) => !memory.cooling || deny("CoolingDown"),
          updateMemory: ({ memory }) => ({ uses: memory.uses + 1, cooling: true }),
          actions: [props.onUse],
        },
        Ready: { target: "self", updateMemory: () => ({ cooling: false }) },
      },
    }),
  );
// host: embeds: { resend: { props: { onUse: { actions: [O.Auth.sendCode.commit(codeInput)] } } } }
```

**Timeout.** A one-state step: something arrives in time, or the time runs out:

```ts
export const Timeout = fragment(
  {
    id: "Timeout",
    events: { Arrived: {} },
    internalEvents: { Expired: {} },
    props: { after: prop<Duration.Input>(), onArrived: callback(), onTimedOut: callback() },
  },
  ({ E, props }) => ({
    schedules: { expire: { schedule: ({ props }) => props.after, send: E.Expired } },
    on: {
      Arrived: { target: "self", actions: [props.onArrived] },
      Expired: { target: "self", actions: [props.onTimedOut] },
    },
  }),
);
// host: states: [{ WAITING_FOR_DRIVER: Timeout }, "ASSIGNED", "ESCALATED"]
//   WAITING_FOR_DRIVER: { props: { after: () => "2 minutes", onArrived: { target: S.ASSIGNED }, onTimedOut: { target: S.ESCALATED } } }
```

**Poll with backoff.** Waits, refreshes, and waits again for a time stretched by failures; one
refresh at a time:

```ts
export const Poll = (p: { every: Duration.Input; maxBackoff: Duration.Input }) =>
  fragment(
    {
      id: "Poll",
      states: ["WAITING", "REFRESHING"],
      internalEvents: { Tick: {}, Ok: {}, Failed: {} },
      memory: { failures: Schema.Int },
      initial: () => ({ failures: 0 }),
      props: { onRefresh: callback() },
    },
    ({ S, E, props }) => ({
      default: S.WAITING,
      states: {
        WAITING: {
          // armed on every entry, with the failure count as it is then
          schedules: {
            tick: {
              schedule: ({ memory }) =>
                Duration.min(Duration.times(p.every, 2 ** memory.failures), p.maxBackoff),
              send: E.Tick,
            },
          },
          on: { Tick: { target: S.REFRESHING, actions: [props.onRefresh] } },
        },
        REFRESHING: {
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
// host: an untagged failure mapping receives every error; defects count as failures too
//   LIVE: { props: { onRefresh: { actions: [O.Tickets.list.refetch(listInput, { outcomes: { success: E.LIVE.Ok, failure: E.LIVE.Failed, defect: E.LIVE.Failed } })] } } }
```

## 4. Confirmation and safety

**Confirm.** One state, two ways out:

```ts
export const Confirm = fragment(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    props: { onConfirm: callback(), onDecline: callback() },
  },
  ({ props }) => ({
    on: {
      Yes: { target: "self", actions: [props.onConfirm] },
      No: { target: "self", actions: [props.onDecline] },
    },
  }),
);
// host: DELETE_ASK: { props: { onConfirm: { target: S.DELETING, actions: [deleteTicket] }, onDecline: { target: S.VIEWING } } }
```

**Hold to confirm**

```ts
export const HoldToConfirm = (p: { hold: Duration.Input }) =>
  fragment(
    {
      id: "HoldToConfirm",
      states: ["IDLE", "HOLDING"],
      events: { Press: {}, Release: {} },
      internalEvents: { Held: {} },
      props: { onConfirmed: callback() },
    },
    ({ S, E, props }) => ({
      default: S.IDLE,
      states: {
        IDLE: { on: { Press: { target: S.HOLDING } } },
        HOLDING: {
          schedules: { held: { schedule: p.hold, send: E.Held } },
          on: {
            Release: { target: S.IDLE },
            Held: { target: S.IDLE, actions: [props.onConfirmed] },
          },
        },
      },
    }),
  );
```

**Type to confirm.** Built from a `Field`; nothing typed means not confirmed:

```ts
export const TypeToConfirm = (p: { phrase: string }) =>
  fragment(
    {
      id: "TypeToConfirm",
      embeds: {
        typed: Field(Schema.String, {
          empty: "",
          validate: (v) => (v === p.phrase ? null : "Does not match"),
        }),
      },
      events: { Confirm: {}, Cancel: {} },
      props: { onConfirm: callback(), onCancel: callback() },
    },
    ({ props }) => ({
      on: {
        Confirm: {
          target: "self",
          guard: ({ memory }) => isValid(memory.typed) || deny("PhraseMismatch"),
          actions: [props.onConfirm],
        },
        Cancel: { target: "self", actions: [props.onCancel] },
      },
    }),
  );
```

## 5. Lists

**Paginate.** The host owns the paged read; the fragment knows when more is possible:

```ts
export const Paginate = fragment(
  {
    id: "Paginate",
    events: { More: {} },
    props: { hasMore: prop<boolean>(), onLoadMore: callback() },
  },
  ({ props }) => ({
    on: {
      More: {
        target: "self",
        guard: ({ props }) => props.hasMore || deny("NoMorePages"),
        actions: [props.onLoadMore],
      },
    },
  }),
);
// host: embeds: { tickets: { props: {
//   hasMore: ({ activities }) => activities.list?.hasMore ?? false,
//   onLoadMore: { actions: [O.Tickets.list.more(listInput)] },
// } } }
```

## 6. Flows built from steps

**A wizard step.** Seeded from what the host kept, so going back keeps what was typed:

```ts
export const AddressStep = fragment(
  {
    id: "AddressStep",
    states: ["FILLING", { CHECK: Confirm }],
    embeds: { street: Field(Schema.String, streetRules), city: Field(Schema.String, cityRules) },
    events: { Next: {}, GoBack: {} },
    props: {
      address: prop.optional<Address>(),
      onDone: callback<{ address: Address }>(),
      onBack: callback(),
    },
  },
  ({ S, props }) => ({
    default: S.FILLING,
    embeds: {
      street: { props: { start: ({ props }) => props.address?.street } },
      city: { props: { start: ({ props }) => props.address?.city } },
    },
    on: { GoBack: { target: "self", actions: [props.onBack] } },
    states: {
      FILLING: {
        on: {
          Next: {
            target: S.CHECK,
            guard: ({ memory }) =>
              (isValid(memory.street) && isValid(memory.city)) || deny("Invalid"),
          },
        },
      },
      CHECK: {
        props: {
          onConfirm: {
            actions: [
              props.onDone.from(({ memory }) => ({
                address: { street: memory.street.value, city: memory.city.value },
              })),
            ],
          },
          onDecline: { target: S.FILLING },
        },
      },
    },
  }),
);
```

**A wizard from steps.** The host keeps each step's result and hands it back:

```ts
// definition (PaymentStep is written like AddressStep; Address, Payment and the field rules are
// ordinary Schemas and functions)
states: ["CART", { ADDRESS: AddressStep }, { PAYMENT: PaymentStep }, { REVIEW: Confirm }, { PLACE: CommitWithRetry(Order, retry) }, "PLACED"],
memory: { address: Schema.NullOr(Address), payment: Schema.NullOr(Payment) },

// machine
ADDRESS: { props: { address: ({ memory }) => memory.address ?? undefined, onDone: { target: S.PAYMENT, updateMemory: ({ payload }) => ({ address: payload.address }) }, onBack: { target: S.CART } } },
PAYMENT: { props: { payment: ({ memory }) => memory.payment ?? undefined, onDone: { target: S.REVIEW, updateMemory: ({ payload }) => ({ payment: payload.payment }) }, onBack: { target: S.ADDRESS } } },
REVIEW: { props: { onConfirm: { target: S.PLACE, actions: [placeOrder] }, onDecline: { target: S.PAYMENT } } },
PLACE: { props: { onSend: { actions: [placeOrder] }, onDone: { target: S.PLACED }, onFailed: { target: S.REVIEW }, onUncertain: { target: S.REVIEW }, onCancel: { target: S.REVIEW } } },
```

## 7. Policy through injected guards

The fragment stays plain; the host attaches its rule to the fragment's event. The host's guard runs
first, and `check()` reports its deny code first:

```ts
embeds: {
  pinned: { guards: { Toggle: ({ context }) => context.canEdit || deny("ReadOnly") } },
  seats: { guards: { Up: ({ memory, context }) => memory.seats.value < context.planSeats || deny("PlanLimit") } },
},
```

## 8. Composition patterns

**The same fragment twice**

```ts
embeds: { pinned: Toggle({ initial: false }), muted: Toggle({ initial: true }) }
```

**Nesting, connected by raising.** A search box is a field plus a debounce; the outer fragment
wires them and exposes one callback:

```ts
export const SearchBox = fragment(
  {
    id: "SearchBox",
    embeds: {
      query: Field(Schema.String, { empty: "", validate: () => null }),
      settle: Debounce({ wait: "300 millis" }),
    },
    props: { onSearch: callback<{ query: string }>() },
  },
  ({ E, props }) => ({
    embeds: {
      query: { props: { onChanged: { raise: [E.settle.Input] } } },
      settle: {
        props: {
          onSettled: {
            actions: [props.onSearch.from(({ memory }) => ({ query: memory.query.value }))],
          },
        },
      },
    },
  }),
);
// host: embeds: { search: { props: { onSearch: { actions: [O.Tickets.list.refetch(({ payload }) => ({ ...base, search: payload.query }))] } } } }
```

**Hiding a fragment's events behind the host's own**

```ts
// definition
embeds: { pinned: { fragment: Toggle({ initial: false }), events: "internal" } },
// outside code can no longer send E.pinned.Toggle; the host exposes PinRequested and raises it
```

**A late outcome.** A save that finishes after the editor left `SAVE` is fenced away from the
fragment and reaches the host's own handler, keyed by the fragment event's full name:

```ts
on: { "SAVE.Succeeded": { target: "self", actions: [toastSaved] } },
```

**One fragment, many machines**

```ts
{
  SAVE: CommitWithRetry(TicketRow, { maxRetries: 5, backoff: "5 seconds" });
} // editor
{
  PAY: CommitWithRetry(Receipt, { maxRetries: 3, backoff: "2 seconds" });
} // checkout
{
  CHUNK: CommitWithRetry(ChunkAck, { maxRetries: 10, backoff: "500 millis" });
} // uploader
```

## 9. A host using several

```ts
// rename.definition.ts
export const Rename = definition({
  id: "DispatchDesk/Rename",
  states: [
    "EDITING",
    { CONFIRM: Confirm },
    { SAVE: CommitWithRetry(TicketRow, { maxRetries: 3, backoff: "2 seconds" }) },
    "DONE",
  ],
  embeds: {
    title: Field(Schema.String, { empty: "", validate: (v) => (v.trim() ? null : "Required") }),
    pinned: Toggle({ initial: false }),
    check: Debounce({ wait: "300 millis" }),
  },
  events: { Submit: {} },
  input: { ticketId: Schema.String, title: Schema.String },
  memory: { ticketId: Schema.String, currentTitle: Schema.String },
  initial: ({ input }) => ({ ticketId: input.ticketId, currentTitle: input.title }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// rename.machine.ts
export const RenameMachine = machine(Rename, ({ S, E, O }) => {
  const save = O.Tickets.saveTitle.commit(
    ({ memory }) => ({
      ticketId: memory.ticketId,
      title: memory.title.value,
      pinned: memory.pinned.on,
    }),
    {
      outcomes: {
        success: E.SAVE.Succeeded.from((t) => ({ value: t })),
        failure: {
          TicketLocked: E.SAVE.Busy,
          TitleRejected: E.SAVE.Rejected.from(({ reason }) => ({ reason })),
        },
        unknown: E.SAVE.Uncertain,
      },
    },
  );
  return {
    default: S.EDITING,
    embeds: {
      title: {
        props: {
          start: ({ memory }) => memory.currentTitle,
          onChanged: { raise: [E.check.Input] },
        },
      }, // starts from the current title; typing feeds the debounce
      check: {
        props: {
          onSettled: {
            actions: [
              O.Tickets.titleTaken.refetch(({ memory }) => ({ title: memory.title.value })),
            ],
          },
        },
      },
    },
    states: {
      EDITING: {
        on: {
          Submit: {
            target: S.CONFIRM,
            guard: ({ memory }) => isValid(memory.title) || deny("Invalid"),
          },
        },
      },
      CONFIRM: {
        props: { onConfirm: { target: S.SAVE, actions: [save] }, onDecline: { target: S.EDITING } },
      },
      SAVE: {
        props: {
          onSend: { actions: [save] },
          onDone: { target: S.DONE },
          onFailed: { target: S.EDITING },
          onUncertain: { target: S.EDITING },
          onCancel: {
            target: S.EDITING,
            actions: [O.Tickets.saveTitle.cancel(({ memory }) => ({ ticketId: memory.ticketId }))],
          },
        },
      },
      DONE: {},
    },
  };
});
```

```ts
// views and senders use the instance names
rename.send(Rename.E.title.Changed({ value }));
rename.send(Rename.E.pinned.Toggle());
rename.send(Rename.E.CONFIRM.Yes());
useView(rename, (s) => visibleError(s.memory.title));
useView(rename, (s) => Rename.S.SAVE.WAITING.is(s));
```

## 10. Testing

`fragmentStory(fragment, { props })` runs one fragment with fixed value props, records every
callback call with its payload in `run.calls`, and lets a test raise the fragment's internal events
in place of operation outcomes.

**A guard and a callback**

```ts
test("Cooldown blocks a second use", async () => {
  const cooldown = Cooldown({ for: "30 seconds" });
  const run = await fragmentStory(cooldown)
    .send(cooldown.E.Use())
    .process()
    .checkpoint("cooling")
    .run();
  expect(check(run.checkpoints.cooling.snapshot, cooldown.E.Use())).toMatchObject({
    _tag: "Denied",
  });
  expect(run.calls.onUse).toHaveLength(1);
});
```

**Retries and giving up**

```ts
test("CommitWithRetry gives up after its retry limit", async () => {
  const commit = CommitWithRetry(TicketRow, { maxRetries: 2, backoff: "1 second" });
  const run = await fragmentStory(commit)
    .raise(commit.E.Busy())
    .process()
    .advance("2 seconds")
    .process() // retry 1
    .raise(commit.E.Busy())
    .process()
    .advance("4 seconds")
    .process() // retry 2
    .raise(commit.E.Busy())
    .process() // gives up
    .run();
  expect(run.calls.onSend).toHaveLength(2);
  expect(run.calls.onFailed).toEqual([{ reason: "gave up after 2 retries" }]);
});
```

**Every path of a small fragment**

```ts
const stepper = Stepper({ min: 0, max: 2, start: 0 });
const { paths, truncated } = model(fragmentStory(stepper), {
  stateKey: (s) => s.memory.value,
}).getSimplePaths({ events: [stepper.E.Up(), stepper.E.Down()] });
```

The host still needs integration Stories for what fragment tests cannot see: its permissions,
cancellation, re-entry, persistence and outcomes that arrive late.
