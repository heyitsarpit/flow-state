# Fragments: reusable machine behaviour

Status: exploration, not part of version 1. No plan has been changed for it; section 14 lists the
plan changes it would need. Where this document and a plan differ, the plan wins.

Examples by use case: [fragment-examples.md](fragment-examples.md).

## 1. The problem

Machines repeat behaviour. In the reference app, the editor's lock retry with backoff and the
queue's poll backoff are the same idea written twice, and draft-versus-saved tracking is written
inline with counters reset by hand (`lockRetries`). Flow State has no way to write a behaviour once
and reuse it:

- **Substates** structure one machine; they cannot be shared between machines.
- **Separate actors** (`useActor`, refs, context, `send`) give component-style reuse, with their
  own identity and lifetime. That is too heavy for a toggle or a retry loop, and it splits one
  workflow across two mailboxes.

What is missing is hook-style reuse: a piece of behaviour, inlined into a machine, with a typed
contract. XState's maintainers advise against sharing state configuration because it breaks
static analysis and typing, and point to separate actors instead
([statelyai/xstate#3283](https://github.com/statelyai/xstate/discussions/3283)). UML's
"submachine state", a reusable composite state with typed entry and exit points, is the closest
prior art ([UML 15.3.11](https://site.uottawa.ca/~tcl/gradtheses/mnojoumian/ThesisFiles/FinalSpec/UML/15.3.11.html)).

## 2. The idea

A **fragment** is behaviour without identity. It declares states, events, memory, guards and
schedules, and is inlined into a host machine when the machine is constructed. The host remains
one actor with one mailbox, one turn and one plain snapshot, and everything still compiles into
one representation ([FlowState.plan](../../FlowState.plan) D1).

A fragment is created by an ordinary function: parameters in, a fragment value (plain data) out.

```ts
export const Toggle = (params: { initial: boolean }) =>
  fragment(
    {
      id: "Toggle",
      events: { Toggle: {} },
      memory: { on: Schema.Boolean },
      initial: () => ({ on: params.initial }),
    },
    () => ({
      on: { Toggle: { target: "self", updateMemory: ({ memory }) => ({ on: !memory.on }) } },
    }),
  );
```

## 3. Machine versus fragment

A machine is behaviour plus everything needed to exist as an actor. A fragment is only the
behaviour.

|                                            | Machine                                          | Fragment                                                         |
| ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------- |
| Identity                                   | id, refs, `ensureActor` / `createActor`          | none; exists only inside a host                                  |
| Mailbox and turns                          | its own                                          | its host's                                                       |
| Lifetime                                   | created, retained, disposed                      | mounted: while its state is active; embedded: the host's         |
| Input and initial                          | `input` and `initial({ input })`, once per actor | parameters and `initial()`; mounted: every entry; embedded: once |
| Memory                                     | owns its memory                                  | owns one named slice; the host reads it, never writes it         |
| States, events, guards, updates, schedules | yes                                              | yes, under its instance name                                     |
| Operations, context, `onContext`, `send`   | yes                                              | no; it declares slots the host fills                             |
| Persistence opt-in                         | yes                                              | no; saved as part of its host                                    |
| Ending                                     | never ends by itself                             | exits: named, typed ways to hand control back                    |
| Contains fragments                         | yes                                              | yes                                                              |

A fragment can do everything inside one actor's head: states, memory, rules and timing. It cannot
touch the world: I/O, other actors, wiring, storage or identity. Section 8 explains why.

So a machine can be read as a collection of fragments:

```text
machine = its own states, events and memory (a root fragment)
        + mounted and embedded fragments
        + runtime capabilities: identity, input, operations, context, send, persistence, lifetime
```

## 4. Two ways to place a fragment

The plans keep exactly one active leaf state per actor ([Machines.plan](../../Machines.plan) O2),
so reusable behaviour comes in two kinds:

- **Sequential**: a step in a flow (save with retry, a confirmation, a wizard step). It has states
  or exits and is **mounted** as one of the host's states.
- **Orthogonal**: something that runs alongside every state (a toggle, a field, a debounce). It has
  no states and is **embedded** at the host's root.

```ts
states: ["EDITING", { CONFIRM: Confirm }, { SAVE: CommitWithRetry(TicketRow, retry) }, "DONE"], // mounted
embeds: { title: Field(Schema.String, titleRules), pinned: Toggle({ initial: false }) },         // embedded
```

An orthogonal behaviour that needs its own states would need parallel regions, which the plans
exclude. It keeps its phase in memory instead (`level: "off" | "low" | "high"`).

## 5. Instance names

The key an embedded fragment is given (`title`, `pinned`), or the state name a mounted fragment is
given (`CONFIRM`, `SAVE`), is the fragment **instance's name**, like naming a component instance.
It is not memory itself. One name does four jobs:

| The name `title` gives                 | Example                               |
| -------------------------------------- | ------------------------------------- |
| the fragment's memory slice            | `memory.title.value`                  |
| its event namespace                    | `Rename.E.title.Changed(...)`         |
| its schedules and activities, prefixed | schedule `title.settle`               |
| where the host binds its slots         | `embeds: { title: { slots: { … } } }` |

For a mounted fragment the state name also appears in the state path (`SAVE.WAITING`). The same
fragment can be used several times under different names:

```ts
embeds: { pinned: Toggle({ initial: false }), muted: Toggle({ initial: true }) }
// memory.pinned.on, memory.muted.on; Rename.E.pinned.Toggle(), Rename.E.muted.Toggle()
```

## 6. Events

Fragments use the same split as machines ([Machines.plan](../../Machines.plan) O1):

- **`events` are public.** They join the host's public events under the instance name, and anyone
  allowed to send to the actor can send them.
- **`internalEvents` are internal.** They come only from the fragment's own schedules and slot
  outcomes, and cannot be sent from outside.

A host may make a fragment's public events internal, so outside code must go through a host event
instead:

```ts
embeds: { pinned: { fragment: Toggle({ initial: false }), events: "internal" } }
```

Events resolve as usual: a fragment's handlers sit at its mount (an embedded fragment's at the
host's root), and if they decline, the event falls through to the host's ancestors (nearest
handler wins).

## 7. The contract: parameters, slots and exits

A fragment's contract works like a React component's props:

| React                                            | Fragment                          |
| ------------------------------------------------ | --------------------------------- |
| static props (`max`, `initial`)                  | **parameters**                    |
| callback props the child calls                   | **action** and **activity** slots |
| a prop the child asks (`isDisabled`)             | **guard** slots                   |
| an operation the child runs, typed by its result | **commit** slots                  |
| events reported to the parent (`onDone`)         | **exits**                         |
| internal state                                   | the fragment's **memory slice**   |

Unlike React, the host can read the fragment's state, slots accept only declared things (an action,
an activity, a guard or a commit, not arbitrary code), and every exit must be mapped.

### Slots

```ts
slots: {
  fire: "action",     // something to do
  list: "activity",   // something to observe while active
  allow: "guard",     // host policy the fragment asks; it can deny
  commit: commitSlot({ success: value, failures: { Busy: {}, Rejected: { reason: Schema.String } } }),
}
```

The fragment uses its slots in its own handlers:

```ts
on: {
  Due: { target: "self", actions: [slots.fire] },
  Toggle: { target: "self", guard: slots.allow, updateMemory: flip },
},
activities: { page: slots.list },
```

A **commit slot** declares the result and failures the fragment expects, and its outcomes arrive as
events of the slot (`commit.Success`, `commit.Busy`, `commit.Rejected`), so the fragment owns the
reaction to outcomes. The host binds a concrete operation and renames its errors to the slot's:

```ts
SAVE: {
  slots: {
    commit: O.Tickets.saveTitle.commit(draftInput).as({ TicketLocked: "Busy", TitleRejected: "Rejected" }),
  },
}
```

A **guard slot** lets a fragment respect host rules without reading context; `check()` still
reports the host's deny code:

```ts
embeds: {
  pinned: {
    slots: {
      allow: ({ context }) => context.canEdit || deny("ReadOnly");
    }
  }
}
```

The definition places fragments; the machine binds their slots, under the same instance names:
`embeds: { name: { slots } }` for embedded fragments, and `slots` inside the mount's state for
mounted ones.

### Exits

A mounted fragment leaves only through its exits, and the host maps every one:

```ts
// fragment:  exits: { Done: { value }, Failed: { reason: Schema.String }, Cancelled: {} }
SAVE: { exits: { Done: S.DONE, Failed: S.EDITING, Cancelled: S.EDITING } }
```

An exit is an ordinary transition out of the mount, so the existing exit and entry ordering
applies: fragment schedules stop and slot activities are released first. Mapping an exit to a
target with a guard, a memory update or actions works as in any handler.

## 8. Why fragments do not own operations

1. **The operation is what varies.** `CommitWithRetry` is reusable because it does not know what it
   commits; owning `saveTitle` would make it a one-machine fragment.
2. **Operation inputs need host data.** Keys and inputs come from host memory and context, which a
   fragment cannot see.
3. **Concurrency is per actor.** Commit policies (reject, cancel, serialize) apply per actor,
   operation and key ([Operations.plan](../../Operations.plan) O3). Operations hidden in two
   fragments of one host would share a queue without either declaring it.
4. **One I/O list per actor.** The host's `operations` is what the setup's services, SSR settling,
   Attempt durability, Story fixtures, `flow check` and the graph all read.
5. **Pure behaviour is cheap to test.** A fragment with no I/O can be checked against a sequence of
   events alone.

Commit slots keep these properties while letting the fragment own the reaction to outcomes.
Something that needs its own operations, context and lifetime is a machine, used as a separate
actor.

## 9. Semantics

**The host reads fragment memory and never writes it.**

```ts
guard: ({ memory }) => memory.pinned.on || deny("NotPinned"); // reading: fine
updateMemory: () => ({ pinned: { on: false } }); // writing: a type error
```

To change a fragment, the host raises one of its events (open question 1).

**Lifetime of memory.** A mounted fragment's memory is created on every entry to its mount and
removed on exit, which replaces hand-reset counters. An embedded fragment's memory lives as long as
the host.

**Late events fall through.** An event for a mounted fragment that arrives after the mount was left
(a save outcome after the editor closed) reaches the host's handlers like any event. `flow check`
warns when one can arrive with nothing to handle it.

**Siblings are independent.** Fragments in one host do not send to or read each other; the host
connects them through exits, slots and raised events.

**Nesting.** Fragments may contain fragments. Names nest: `E.ADDRESS.street.Changed`,
`memory.ADDRESS.street.value`, state path `ADDRESS.CHECK`.

**Persistence.** The saved state path includes fragment states, and memory includes fragment
slices. Restore resumes them with no re-initialization and no replay
([Persistence.plan](../../Persistence.plan) O4). A fragment's id and version are part of its host's
saved shape, so changing a fragment's memory invalidates saved data like any schema change.

**Tools.** `check()`, inspection, Stories and models see ordinary states, tagged with
`fragment: { id, instance }` so graphs can collapse a fragment into one box. `flow check` errors on
unmapped exits and unbound slots.

## 10. A small catalogue

Each of these is a few lines of fragment code, written once and reused.

**`Confirm`**, mounted, exits only:

```ts
export const Confirm = fragment(
  { id: "Confirm", events: { Yes: {}, No: {} }, exits: { Confirmed: {}, Declined: {} } },
  ({ X }) => ({ on: { Yes: X.Confirmed, No: X.Declined } }),
);
```

**`Field<V>`**, embedded, with a validation parameter:

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

**`Debounce`**, embedded, with a schedule and an action slot:

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

**`CommitWithRetry<V>`**, mounted, with a commit slot:

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
              X.Failed.from(({ memory }) => ({
                reason: `gave up after ${memory.retries} retries`,
              })),
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

`Undo<V>`, `Paginate` (an activity slot over any paged read) and wizard steps built from `Field`
and `Confirm` follow the same pattern.

## 11. A host using them

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
  input: { ticketId: Schema.String },
  memory: { ticketId: Schema.String },
  initial: ({ input }) => ({ ticketId: input.ticketId }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// rename.machine.ts
export const RenameMachine = machine(Rename, ({ S, O }) => ({
  default: S.EDITING,
  embeds: {
    check: {
      slots: {
        fire: O.Tickets.titleTaken.refetch(({ memory }) => ({ title: memory.title.value })),
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
    CONFIRM: { exits: { Confirmed: S.SAVE, Declined: S.EDITING } },
    SAVE: {
      slots: {
        commit: O.Tickets.saveTitle
          .commit(({ memory }) => ({
            ticketId: memory.ticketId,
            title: memory.title.value,
            pinned: memory.pinned.on,
          }))
          .as({ TicketLocked: "Busy", TitleRejected: "Rejected" }),
      },
      exits: { Done: S.DONE, Failed: S.EDITING, Cancelled: S.EDITING },
    },
    DONE: {},
  },
}));
```

```ts
// views and senders use the instance names
rename.send(Rename.E.title.Changed({ value }));
rename.send(Rename.E.pinned.Toggle());
rename.send(Rename.E.CONFIRM.Yes());
useView(rename, (s) => s.memory.title.error);
useView(rename, (s) => Rename.S.SAVE.WAITING.is(s));
```

## 12. Testing a fragment on its own

A fragment has no I/O, so it can be tested with fake slots, and its whole state space is small
enough for models to explore completely:

```ts
test("gives up after the retry limit", async () => {
  const run = await fragmentStory(
    CommitWithRetry(TicketRow, { maxRetries: 2, backoff: "1 second" }),
    {
      slots: { commit: fakeCommit.alwaysBusy },
    },
  )
    .enter()
    .process()
    .advance("2 seconds")
    .process()
    .advance("4 seconds")
    .process()
    .run();

  expect(run.exit).toMatchObject({ _tag: "Failed" });
});
```

A host's tests then check only its wiring: that each exit leads somewhere sensible and each slot
is bound to the right operation.

## 13. What it unlocks

- **Machines become assembly.** A machine reads as a parts list of behaviours plus what is specific
  to it: which operation, which states connect where, which host rules apply.
- **A design system for behaviour.** Teams share `Confirm`, `Field`, `Debounce`, `Undo`,
  `Paginate` and `CommitWithRetry` the way they share UI components. A bug fixed in a fragment is
  fixed in every host, and policy ("every destructive action confirms") becomes consistent by
  construction.
- **Forms and multi-step flows stop being awkward.** A form is a set of `Field`s plus a submit
  fragment; a wizard is a sequence of mounted steps wired exit to entry, and the same step can
  appear in different flows.
- **A testing pyramid for state machines.** Fragments are tested once in isolation; hosts test only
  their wiring.
- **Agents assemble instead of invent.** Choosing fragments and filling typed contracts is easier
  to get right and to verify than designing a statechart; `flow check` catches unmapped exits and
  unbound slots.
- **Diagrams with zoom levels.** A graph collapses each fragment into one box, and coverage reports
  per fragment.
- **Refactoring like functions.** Extract repeated states into a fragment, or inline a fragment
  used once; the compiled behaviour does not change.
- **Sharing beyond one app.** Fragments are plain values with typed contracts, so they can live in
  a package.

Costs to keep in mind: indirection when reading a machine, over-fragmenting trivial behaviour (a
lint can flag fragments used once), inference cost for generic fragments, versioning of shared
fragments, and the single-active-state limit, which still applies.

## 14. Version 1, open questions and plan changes

Nothing in version 1 needs fragments. They would come after the core Runtime stage (S3), proved
first by converting the editor's lock retry and the queue's poll backoff into one shared fragment.

Open questions:

1. **Raising a fragment event from a host handler.** Today actions queue sends for a later turn.
   Should a host transition be able to raise an event to a fragment it contains, handled in the
   same turn?
2. **Parameters.** Plain TypeScript values, or Schema-encodable data so inspection can record them
   (Schemas passed as type parameters, such as `Field(Schema.String, …)`, aside)?
3. **Fragment versions.** How a fragment's version feeds the host's persistence version and the SSR
   shape digest.
4. **Commit slot shape.** How much of a commit's outcome contract a slot can declare, and how the
   host's error names are adapted.

Plan changes, once accepted:

- **[Machines.plan](../../Machines.plan) O1:** `fragment`, `embeds`, fragments in the state list,
  instance names, event visibility, and what fragments may not declare.
- **Machines O2:** mounting, exits as transitions out of the mount, fall-through of fragment events.
- **Machines O5, O6:** schedules and slot activities owned by a fragment and stopped on exit.
- **Machines O8:** nested memory slices and fragment states in snapshots.
- **[Operations.plan](../../Operations.plan):** commit slots and adapting error names.
- **[Testing.plan](../../Testing.plan):** `fragmentStory` for testing a fragment with fake slots.
- **[Persistence.plan](../../Persistence.plan) and
  [ServerRendering.plan](../../ServerRendering.plan):** fragment versions in the saved shape and the
  shape digest.
- **[Inspection.plan](../../Inspection.plan), [CommandLine.plan](../../CommandLine.plan):**
  fragment tags, collapsed graphs, checks for unmapped exits and unbound slots.
- **[Package.plan](../../Package.plan):** the `fragment` and `commitSlot` exports, and
  `fragmentStory` in `flow-state/testing`.
- **[FlowState.plan](../../FlowState.plan):** a new build stage after S3.
