# Fragments: reusable machine behaviour

Status: exploration, not part of version 1. No plan has been changed for it; section 11 lists the
plan changes it would need. Where this document and a plan differ, the plan wins.

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

// any machine
embeds: {
  pinned: Toggle({ initial: false });
}
// views:  s.memory.pinned.on        editor.send(Editor.E.pinned.Toggle())
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
| Memory                                     | owns its memory                                  | owns one namespaced slice; the host reads it, never writes it    |
| States, events, guards, updates, schedules | yes                                              | yes, namespaced under its mount                                  |
| Operations, context, `onContext`, `send`   | yes                                              | no; it declares slots the host fills                             |
| Persistence opt-in                         | yes                                              | no; saved as part of its host                                    |
| Ending                                     | never ends by itself                             | exits: named, typed ways to hand control back                    |
| Contains fragments                         | yes                                              | yes                                                              |

A fragment can do everything inside one actor's head: states, memory, rules and timing. It cannot
touch the world: I/O, other actors, wiring, storage or identity. Section 6 explains why.

So a machine can be read as a collection of fragments:

```text
machine = its own states, events and memory (a root fragment)
        + mounted and embedded fragments
        + runtime capabilities: identity, input, operations, context, send, persistence, lifetime
```

## 4. Two ways to place a fragment

The plans keep exactly one active leaf state per actor ([Machines.plan](../../Machines.plan) O2),
so reusable behaviour comes in two kinds:

- **Sequential**: a step in a flow (save with retry, a wizard step). It has states and is
  **mounted** as one of the host's states.
- **Orthogonal**: something that runs alongside every state (a toggle, a draft tracker, a
  debounce). It has no states and is **embedded** at the host's root.

```ts
states: [{ OPEN: ["EDITING", { SAVE: SaveTitle }, "SAVED"] }, "CLOSED"], // mounted
embeds: { title: TitleDraft, pinned: Toggle({ initial: false }) },       // embedded
// a mounted fragment's states appear in the path: "OPEN.SAVE.WAITING"
```

An orthogonal behaviour that needs its own states would need parallel regions, which the plans
exclude. It keeps its phase in memory instead (`level: "off" | "low" | "high"`).

## 5. The contract: parameters, slots and exits

A fragment's contract works like a React component's props:

| React                                    | Fragment                          |
| ---------------------------------------- | --------------------------------- |
| static props (`max`, `initial`)          | **parameters**                    |
| callback props the child calls           | **action** and **activity** slots |
| a prop the child asks (`isDisabled`)     | **guard** slots                   |
| events reported to the parent (`onDone`) | **exits**                         |
| internal state                           | the fragment's **memory slice**   |

Unlike React, the host can read the fragment's state, slots accept only declared things (an
action, an activity or a guard, not arbitrary code), and every exit must be mapped.

### Slots

```ts
slots: {
  commit: commitSlot({ success: value, failures: { Busy: {}, Rejected: { reason: Schema.String } } }),
  poll: "activity",   // a subscription the host supplies, held while mounted
  allow: "guard",     // host policy the fragment asks; it can deny
}
```

- **Commit slots** declare the shape of operation the fragment needs and let the fragment own the
  outcome mapping. The host binds a concrete operation and adapts its error names:

  ```ts
  SAVE: {
    slots: {
      commit: O.Tickets.saveTitle.commit(draftInput)
        .as({ TicketLocked: "Busy", TitleRejected: "Rejected" }),
    },
  }
  ```

- **Guard slots** let a fragment respect host rules without reading context. `check()` still
  reports the host's deny code:

  ```ts
  // fragment:  on: { Toggle: { target: "self", guard: slots.allow, updateMemory: flip } }
  // host:      embeds: { pinned: { slots: { allow: ({ context }) => context.canEdit || deny("ReadOnly") } } }
  ```

### Exits

A mounted fragment leaves only through its exits, and the host maps every one:

```ts
// fragment:  exits: { Done: { value }, Failed: { reason: Schema.String }, Cancelled: {} }
SAVE: { exits: { Done: S.OPEN.SAVED, Failed: S.OPEN.FAILED, Cancelled: S.OPEN.EDITING } }
```

An exit is an ordinary transition out of the mount, so the existing exit and entry ordering
applies: fragment schedules stop and slot activities are released first. Mapping an exit to a
target with a guard or a memory update works as in any handler.

## 6. Why fragments do not own operations

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

Commit slots keep these properties while letting the fragment own the reaction to outcomes, which
is the reusable part. Something that needs its own operations, context and lifetime is a machine,
used as a separate actor.

## 7. Semantics

**Events are namespaced and resolve as usual.** `E.SAVE.Cancel`, `E.pinned.Toggle`. A fragment's
handlers sit at its mount; if they decline, the event falls through to the host's ancestors
(nearest handler wins). Public fragment events can be sent from outside; internal ones come only
from the fragment's schedules and slot outcomes.

**The host reads fragment memory and never writes it.**

```ts
guard: ({ memory }) => memory.pinned.on || deny("NotPinned"); // reading: fine
updateMemory: () => ({ pinned: { on: false } }); // writing: a type error
```

To change a fragment, the host raises one of its events (open question 1).

**Lifetime of memory.** A mounted fragment's memory is created on every entry to its mount and
removed on exit, which replaces hand-reset counters. An embedded fragment's memory lives as long as
the host.

**Late events fall through.** An event for a mounted fragment that arrives after the mount was
left (a save outcome after the editor closed) reaches the host's handlers like any event. `flow
check` warns when one can arrive with nothing to handle it.

**Siblings are independent.** Fragments in one host do not send to or read each other; the host
connects them through exits, slots and raised events.

**Persistence.** The saved state path includes fragment states, and memory includes fragment
slices. Restore resumes them with no re-initialization and no replay
([Persistence.plan](../../Persistence.plan) O4). A fragment's id and version are part of its
host's saved shape, so changing a fragment's memory invalidates saved data like any schema change.

**Tools.** `check()`, inspection, Stories and models see ordinary states, tagged with
`fragment: { id, mount }` so graphs can collapse a fragment into one box. `flow check` errors on
unmapped exits and unbound slots.

## 8. A worked example

`CommitWithRetry` replaces the editor's hand-written lock retry. The definition mounts it:

```ts
export const SaveTitle = CommitWithRetry(TicketRow, { maxRetries: 5, backoff: "5 seconds" });

export const Editor = definition({
  id: "DispatchDesk/Editor",
  states: [{ OPEN: ["EDITING", { SAVE: SaveTitle }, "SAVED", "FAILED"] }, "CLOSED"],
  embeds: { title: Draft(Schema.String, { empty: "" }) },
  // …
});
```

The machine enters the mount, binds the commit and maps the exits:

```ts
EDITING: { on: { SaveRequested: { target: S.OPEN.SAVE, guard: canSave } } },
SAVE: {
  slots: {
    commit: O.Tickets.saveTitle.commit(draftInput)
      .as({ TicketLocked: "Busy", TitleRejected: "Rejected" }),
  },
  exits: {
    Done: { target: S.OPEN.SAVED, actions: [toastSaved] },
    Failed: { target: S.OPEN.FAILED, updateMemory: ({ event }) => ({ error: event.reason }) },
    Cancelled: S.OPEN.EDITING,
  },
},
```

The fragment starts the commit on entry, backs off and retries on `Busy`, and exits on success,
rejection or cancel. The snapshot stays plain data:

```ts
{ state: "OPEN.SAVE.WAITING", memory: { /* host fields */, title: { draft, saved }, SAVE: { retries: 2 } } }
```

## 9. Version 1 and scope

Nothing in version 1 needs fragments, and they add a new export (`fragment`), new definition
fields and new `flow check` rules. They would come after the core Runtime stage (S3), proved first
by converting the editor's lock retry and the queue's poll backoff into one shared fragment.

## 10. Open questions

1. **Raising a fragment event from a host handler.** Today actions queue sends for a later turn.
   Should a host transition be able to raise an event to a fragment it contains, handled in the
   same turn?
2. **Parameters.** Plain TypeScript values, or Schema-encodable data so inspection can record them
   (Schemas passed as type parameters, such as `Draft(Schema.String)`, aside)?
3. **Fragment versions.** How a fragment's version feeds the host's persistence version and the
   SSR shape digest.
4. **Commit slot shape.** How much of a commit's outcome contract a slot can declare, and how the
   host's error names are adapted.

## 11. Plan changes, once accepted

- **[Machines.plan](../../Machines.plan) O1:** `fragment`, `embeds`, fragments in the state list,
  namespacing of events, memory, schedules and activities, and what fragments may not declare.
- **Machines O2:** mounting, exits as transitions out of the mount, fall-through of fragment
  events.
- **Machines O5, O6:** schedules and slot activities owned by a mount and stopped on exit.
- **Machines O8:** nested memory slices and fragment states in snapshots.
- **[Operations.plan](../../Operations.plan):** commit slots and adapting error names.
- **[Persistence.plan](../../Persistence.plan) and
  [ServerRendering.plan](../../ServerRendering.plan):** fragment versions in the saved shape and
  the shape digest.
- **[Inspection.plan](../../Inspection.plan), [CommandLine.plan](../../CommandLine.plan):**
  fragment tags, collapsed graphs, checks for unmapped exits and unbound slots.
- **[Package.plan](../../Package.plan):** the `fragment` export.
- **[FlowState.plan](../../FlowState.plan):** a new build stage after S3.
