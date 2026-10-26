# Fragment examples by use case

Companion to [fragments.md](fragments.md). Each example is deliberately small and shows one idea.
The API is proposed, not built. Imports (`fragment`, `commitSlot`, `deny`, `Schema`, `Duration`)
are omitted.

Conventions used below:

- `fragment(contract, build)`: the contract declares events, memory, states, slots and exits; the
  build function returns handlers, like a machine.
- **Mounted** fragments go in a host's `states` (`{ SAVE: CommitWithRetry(…) }`); **embedded** ones
  go in `embeds` (`{ pinned: Toggle(…) }`).
- The host reads `memory.<name>`, sends `E.<name>.<Event>`, binds `slots` and maps `exits`.

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
      memory: { level: Schema.Literals(levels) },
      initial: () => ({ level: levels[0] }),
    },
    () => ({
      on: {
        Next: {
          target: "self",
          updateMemory: ({ memory }) => ({
            level: levels[(levels.indexOf(memory.level) + 1) % levels.length],
          }),
        },
      },
    }),
  );
// embeds: { fan: Cycle(["off", "low", "high"]) }   →  memory.fan.level
```

**Disclosure.** Open, close and Escape:

```ts
export const Disclosure = fragment(
  {
    id: "Disclosure",
    events: { Open: {}, Close: {}, Escape: {} },
    memory: { open: Schema.Boolean },
    initial: () => ({ open: false }),
  },
  () => ({
    on: {
      Open: { target: "self", updateMemory: () => ({ open: true }) },
      Close: { target: "self", updateMemory: () => ({ open: false }) },
      Escape: {
        target: "self",
        guard: ({ memory }) => memory.open || deny("AlreadyClosed"),
        updateMemory: () => ({ open: false }),
      },
    },
  }),
);
```

**Copied flash.** Shows "Copied" for two seconds, then resets itself:

```ts
export const Flash = (p: { for: Duration.Input }) =>
  fragment(
    {
      id: "Flash",
      events: { Show: {} },
      internalEvents: { Hide: {} },
      memory: { visible: Schema.Boolean },
      initial: () => ({ visible: false }),
    },
    ({ E }) => ({
      schedules: {
        hide: { schedule: p.for, send: E.Hide, restartOn: ({ memory }) => memory.visible },
      },
      on: {
        Show: { target: "self", updateMemory: () => ({ visible: true }) },
        Hide: { target: "self", updateMemory: () => ({ visible: false }) },
      },
    }),
  );
// embeds: { copied: Flash({ for: "2 seconds" }) }
```

**Stepper with bounds**

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
// check(s, E.qty.Up()) → Denied("AtMax") disables the + button with no extra code
```

## 2. Forms and editing

**Field with validation**

```ts
export const Field = <V extends Schema.Top>(
  value: V,
  p: { empty: V["Type"]; validate: (v: V["Type"]) => string | null },
) =>
  fragment(
    {
      id: "Field",
      events: { Changed: { value }, Blurred: {} },
      memory: { value, touched: Schema.Boolean, error: Schema.NullOr(Schema.String) },
      initial: () => ({ value: p.empty, touched: false, error: null }),
    },
    () => ({
      on: {
        Changed: {
          target: "self",
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
        },
        Blurred: { target: "self", updateMemory: () => ({ touched: true }) },
      },
    }),
  );
export const isValid = (f: { error: string | null }) => f.error === null;
```

**Draft against a confirmed value.** Server values never overwrite local edits:

```ts
export const Draft = <V extends Schema.Top>(value: V, p: { empty: V["Type"] }) =>
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
// host maps a confirmed server value in:  value: E.title.Confirmed.from((t) => ({ value: t.title }))
```

**A whole form from fields.** The host adds only the submit rule:

```ts
definition({
  id: "Signup",
  states: ["FILLING", { SUBMIT: CommitWithRetry(User, retry) }, "DONE"],
  embeds: {
    email: Field(Schema.String, { empty: "", validate: emailRule }),
    password: Field(Schema.String, { empty: "", validate: passwordRule }),
  },
  events: { Submit: {} },
});
// FILLING: { on: { Submit: { target: S.SUBMIT, guard: ({ memory }) => (isValid(memory.email) && isValid(memory.password)) || deny("Invalid") } } }
```

**Undo history over a value**

```ts
export const Undo = <V extends Schema.Top>(value: V) =>
  fragment(
    {
      id: "Undo",
      events: { Undo: {} },
      internalEvents: { Record: { value } },
      memory: { past: Schema.Array(value) },
      initial: () => ({ past: [] }),
      slots: { apply: "action" },
    },
    ({ slots }) => ({
      on: {
        Record: {
          target: "self",
          updateMemory: ({ event, memory }) => ({ past: [...memory.past, event.value].slice(-50) }),
        },
        Undo: {
          target: "self",
          guard: ({ memory }) => memory.past.length > 0 || deny("NothingToUndo"),
          updateMemory: ({ memory }) => ({ past: memory.past.slice(0, -1) }),
          actions: [slots.apply],
        },
      },
    }),
  );
```

## 3. Async work

**Commit with retry**, mounted, with a commit slot:

```ts
export const CommitWithRetry = <V extends Schema.Top>(
  value: V,
  p: { maxRetries: number; backoff: Duration.Input },
) =>
  fragment(
    {
      id: "CommitWithRetry",
      states: ["SENDING", "WAITING"],
      events: { Cancel: {} },
      internalEvents: { RetryDue: {} },
      memory: { retries: Schema.Int },
      initial: () => ({ retries: 0 }),
      slots: {
        commit: commitSlot({
          success: value,
          failures: { Busy: {}, Rejected: { reason: Schema.String } },
        }),
      },
      exits: { Done: { value }, Failed: { reason: Schema.String }, Cancelled: {} },
    },
    ({ S, E, X, slots }) => ({
      default: S.SENDING,
      on: { Cancel: X.Cancelled },
      states: {
        SENDING: {
          entry: [slots.commit],
          on: {
            "commit.Success": X.Done.from(({ event }) => ({ value: event.value })),
            "commit.Rejected": X.Failed.from(({ event }) => ({ reason: event.reason })),
            "commit.Busy": [
              {
                target: S.WAITING,
                guard: ({ memory }) => memory.retries < p.maxRetries || deny("RetryLimitReached"),
                updateMemory: ({ memory }) => ({ retries: memory.retries + 1 }),
              },
              X.Failed.from(() => ({ reason: "gave up" })),
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
          on: { RetryDue: S.SENDING },
        },
      },
    }),
  );
```

**Debounce**

```ts
export const Debounce = (p: { wait: Duration.Input }) =>
  fragment(
    {
      id: "Debounce",
      events: { Input: {} },
      internalEvents: { Due: {} },
      memory: { pending: Schema.Boolean },
      initial: () => ({ pending: false }),
      slots: { fire: "action" },
    },
    ({ E, slots }) => ({
      schedules: {
        settle: { schedule: p.wait, send: E.Due, restartOn: ({ memory }) => memory.pending },
      },
      on: {
        Input: { target: "self", updateMemory: () => ({ pending: true }) },
        Due: { target: "self", updateMemory: () => ({ pending: false }), actions: [slots.fire] },
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
      memory: { cooling: Schema.Boolean },
      initial: () => ({ cooling: false }),
      slots: { act: "action" },
    },
    ({ E, slots }) => ({
      schedules: {
        ready: { schedule: p.for, send: E.Ready, restartOn: ({ memory }) => memory.cooling },
      },
      on: {
        Use: {
          target: "self",
          guard: ({ memory }) => !memory.cooling || deny("CoolingDown"),
          updateMemory: () => ({ cooling: true }),
          actions: [slots.act],
        },
        Ready: { target: "self", updateMemory: () => ({ cooling: false }) },
      },
    }),
  );
// embeds: { resend: { fragment: Cooldown({ for: "30 seconds" }), slots: { act: O.Auth.sendCode.commit(codeInput) } } }
```

**Timeout.** Gives up if nothing happens in time:

```ts
export const Timeout = (p: { after: Duration.Input }) =>
  fragment(
    {
      id: "Timeout",
      events: { Arrived: {} },
      internalEvents: { Expired: {} },
      exits: { InTime: {}, TimedOut: {} },
    },
    ({ E, X }) => ({
      schedules: { expire: { schedule: p.after, send: E.Expired } },
      on: { Arrived: X.InTime, Expired: X.TimedOut },
    }),
  );
// states: [{ WAITING_FOR_DRIVER: Timeout({ after: "2 minutes" }) }, …]
```

**Poll with backoff.** An activity slot, refreshed on a growing schedule:

```ts
export const Poll = (p: { every: Duration.Input; maxBackoff: Duration.Input }) =>
  fragment(
    {
      id: "Poll",
      internalEvents: { Tick: {} },
      memory: { failures: Schema.Int },
      initial: () => ({ failures: 0 }),
      slots: { refresh: "action", watch: "activity" },
    },
    ({ E, slots }) => ({
      activities: { watched: slots.watch },
      schedules: {
        tick: {
          schedule: ({ memory }) =>
            Duration.min(Duration.times(p.every, 2 ** memory.failures), p.maxBackoff),
          send: E.Tick,
        },
      },
      on: { Tick: { target: "self", actions: [slots.refresh] } },
    }),
  );
```

## 4. Confirmation and safety

**Confirm**

```ts
export const Confirm = fragment(
  { id: "Confirm", events: { Yes: {}, No: {} }, exits: { Confirmed: {}, Declined: {} } },
  ({ X }) => ({ on: { Yes: X.Confirmed, No: X.Declined } }),
);
// DELETE_ASK: { exits: { Confirmed: { target: S.DELETING, actions: [deleteTicket] }, Declined: S.VIEWING } }
```

**Hold to confirm.** The action only fires after a press is held:

```ts
export const HoldToConfirm = (p: { hold: Duration.Input }) =>
  fragment(
    {
      id: "HoldToConfirm",
      states: ["IDLE", "HOLDING"],
      events: { Press: {}, Release: {} },
      internalEvents: { Held: {} },
      exits: { Confirmed: {} },
    },
    ({ S, E, X }) => ({
      default: S.IDLE,
      states: {
        IDLE: { on: { Press: S.HOLDING } },
        HOLDING: {
          schedules: { held: { schedule: p.hold, send: E.Held } },
          on: { Release: S.IDLE, Held: X.Confirmed },
        },
      },
    }),
  );
```

**Typed confirmation.** The user must type the resource name, built from a `Field`:

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
      exits: { Confirmed: {}, Cancelled: {} },
    },
    ({ X }) => ({
      on: {
        Confirm: {
          target: X.Confirmed,
          guard: ({ memory }) => isValid(memory.typed) || deny("PhraseMismatch"),
        },
        Cancel: X.Cancelled,
      },
    }),
  );
```

## 5. Lists and selection

**Paginate.** Over any paged read the host supplies:

```ts
export const Paginate = fragment(
  { id: "Paginate", events: { More: {} }, slots: { list: "activity", more: "action" } },
  ({ slots }) => ({
    activities: { page: slots.list },
    on: {
      More: {
        target: "self",
        guard: ({ activities }) => activities.page?.hasMore || deny("NoMorePages"),
        actions: [slots.more],
      },
    },
  }),
);
```

**Selection.** A set of keys, with select-all:

```ts
export const Selection = <K extends Schema.Top>(key: K) =>
  fragment(
    {
      id: "Selection",
      events: { Toggle: { key }, Clear: {}, SelectAll: { keys: Schema.Array(key) } },
      memory: { selected: Schema.Array(key) },
      initial: () => ({ selected: [] }),
    },
    () => ({
      on: {
        Toggle: {
          target: "self",
          updateMemory: ({ event, memory }) => ({ selected: toggleIn(memory.selected, event.key) }),
        },
        Clear: { target: "self", updateMemory: () => ({ selected: [] }) },
        SelectAll: { target: "self", updateMemory: ({ event }) => ({ selected: event.keys }) },
      },
    }),
  );
// guard for bulk delete: ({ memory }) => memory.rows.selected.length > 0 || deny("NothingSelected")
```

**Sort and filter state.** Input to a list read, never a client-side sort:

```ts
export const ListQuery = <F extends Schema.Top>(filter: F, p: { initial: F["Type"] }) =>
  fragment(
    {
      id: "ListQuery",
      events: { Filter: { filter }, SortBy: { field: Schema.String } },
      memory: { filter, sortBy: Schema.String },
      initial: () => ({ filter: p.initial, sortBy: "updatedAt" }),
    },
    () => ({
      on: {
        Filter: { target: "self", updateMemory: ({ event }) => ({ filter: event.filter }) },
        SortBy: { target: "self", updateMemory: ({ event }) => ({ sortBy: event.field }) },
      },
    }),
  );
// the host's list activity reads memory.query.filter and memory.query.sortBy as its input
```

## 6. Flows built from steps

**A wizard step.** Two fields plus a confirm, ending in an exit:

```ts
export const AddressStep = fragment(
  {
    id: "AddressStep",
    states: ["FILLING", { CHECK: Confirm }],
    embeds: { street: Field(Schema.String, streetRules), city: Field(Schema.String, cityRules) },
    events: { Next: {}, Back: {} },
    exits: { Done: { address: Address }, Back: {} },
  },
  ({ S, X }) => ({
    default: S.FILLING,
    on: { Back: X.Back },
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
        exits: {
          Confirmed: X.Done.from(({ memory }) => ({ address: toAddress(memory) })),
          Declined: S.FILLING,
        },
      },
    },
  }),
);
```

**A wizard from steps.** The host only wires exit to entry:

```ts
states: [{ ADDRESS: AddressStep }, { PAYMENT: PaymentStep }, { REVIEW: Confirm }, { PLACE: CommitWithRetry(Order, retry) }, "PLACED"],

ADDRESS: { exits: { Done: S.PAYMENT, Back: S.CART } },
PAYMENT: { exits: { Done: S.REVIEW, Back: S.ADDRESS } },
REVIEW:  { exits: { Confirmed: S.PLACE, Declined: S.PAYMENT } },
PLACE:   { slots: { commit: O.Orders.place.commit(orderInput) }, exits: { Done: S.PLACED, Failed: S.REVIEW, Cancelled: S.REVIEW } },
```

**Load with retry.** A loading screen that offers "Try again":

```ts
export const Load = <V extends Schema.Top>(value: V) =>
  fragment(
    {
      id: "Load",
      states: ["LOADING", "ERROR"],
      events: { Retry: {} },
      slots: {
        load: commitSlot({ success: value, failures: { Failed: { reason: Schema.String } } }),
      },
      exits: { Loaded: { value } },
    },
    ({ S, X, slots }) => ({
      default: S.LOADING,
      states: {
        LOADING: {
          entry: [slots.load],
          on: {
            "load.Success": X.Loaded.from(({ event }) => ({ value: event.value })),
            "load.Failed": S.ERROR,
          },
        },
        ERROR: { on: { Retry: S.LOADING } },
      },
    }),
  );
```

## 7. Policy through guard slots

**Permission-gated toggle.** The fragment asks; the host decides why:

```ts
// in Toggle:  Toggle: { target: "self", guard: slots.allow, updateMemory: flip }
embeds: { pinned: { fragment: Toggle({ initial: false }), slots: { allow: ({ context }) => context.canEdit || deny("ReadOnly") } } }
```

**Business rules without the fragment knowing them**

```ts
// Stepper with a host cap from context
embeds: { seats: { fragment: Stepper({ min: 1, max: 100, start: 1 }), slots: { allowUp: ({ memory, context }) => memory.seats.value < context.planSeats || deny("PlanLimit") } } }
```

## 8. Composition patterns

**The same fragment twice**

```ts
embeds: { pinned: Toggle({ initial: false }), muted: Toggle({ initial: true }) }
```

**Nesting and slot forwarding.** The inner slot becomes the outer fragment's slot:

```ts
export const SearchBox = fragment(
  {
    id: "SearchBox",
    embeds: { query: Field(Schema.String, anyText), settle: Debounce({ wait: "300 millis" }) },
    slots: { search: "action" },
  },
  ({ slots }) => ({ embeds: { settle: { slots: { fire: slots.search } } } }),
);
// host: embeds: { search: { fragment: SearchBox, slots: { search: O.Tickets.list.refetch(searchKey) } } }
```

**Hiding a fragment's events behind the host's own**

```ts
embeds: { pinned: { fragment: Toggle({ initial: false }), events: "internal" } }
// outside code can no longer send E.pinned.Toggle; the host exposes PinRequested instead
```

**A late outcome falls through to the host**

```ts
// the save finished after the editor left SAVE
on: { "SAVE.commit.Success": { target: "self", actions: [toastSaved] } },
```

**Choosing between fragments by state.** Different behaviour per phase, same host:

```ts
states: [{ DRAFTING: Draft(Body, empty) }, { PUBLISHING: CommitWithRetry(Post, retry) }, { SCHEDULED: Timeout({ after: "1 hour" }) }],
```

## 9. One fragment, many machines

```ts
// editor
{
  SAVE: CommitWithRetry(TicketRow, { maxRetries: 5, backoff: "5 seconds" });
}
// checkout
{
  PAY: CommitWithRetry(Receipt, { maxRetries: 3, backoff: "2 seconds" });
}
// uploader
{
  CHUNK: CommitWithRetry(ChunkAck, { maxRetries: 10, backoff: "500 millis" });
}
// queue filter and editor pin share Toggle; signup and settings share Field
```

## 10. Testing

**A fragment on its own, with fake slots**

```ts
test("Cooldown blocks a second use", async () => {
  const run = await fragmentStory(Cooldown({ for: "30 seconds" }), { slots: { act: fake.action } })
    .send(Cooldown.E.Use())
    .process()
    .checkpoint("cooling")
    .send(Cooldown.E.Use())
    .process()
    .run();
  expect(run.checkpoints.cooling.check(Cooldown.E.Use())).toMatchObject({ _tag: "Denied" });
});
```

**Exploring every path of a fragment**

```ts
const { paths } = model(fragmentStory(Stepper({ min: 0, max: 2, start: 0 })), {
  stateKey: (s) => s.memory.value,
}).getSimplePaths({ events: [Stepper.E.Up(), Stepper.E.Down()] });
// small fragments have small state spaces, so every path can be checked
```

**A host's wiring only**

```ts
// the retry logic is already proven; the host test checks where exits lead
story
  .app(DeskSetup, { id: "rename-gives-up", fixtures: [AlwaysLocked] })
  .ensure(RenameRef, { input })
  .send(RenameRef, Rename.E.Submit())
  .send(RenameRef, Rename.E.CONFIRM.Yes())
  .process()
  .advance("1 minute")
  .process()
  .checkpoint("back-to-editing");
```
