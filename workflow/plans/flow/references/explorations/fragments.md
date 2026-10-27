# Fragments: reusable machine behaviour

Status: exploration, not part of version 1. No plan has been changed for it; section 12 lists the
plan changes it would need. Where this document and a plan differ, the plan wins.

Companion files: [fragment-examples.md](fragment-examples.md) holds the full code of every fragment;
[fragment-contract-syntax.md](fragment-contract-syntax.md) records how this contract syntax was
chosen.

## 1. The problem

Machines repeat behaviour. In the reference app, the editor's lock retry with backoff and the
queue's poll backoff are the same idea written twice, and draft-versus-saved tracking is written
inline with counters reset by hand (`lockRetries`). Flow State has no way to write a behaviour once
and reuse it:

- **Substates** structure one machine; they cannot be shared between machines.
- **Separate actors** (`useActor`, refs, context, `send`) give component-style reuse with their
  own identity and lifetime. That is too heavy for a toggle or a retry loop, and it splits one
  workflow across two mailboxes.

What is missing is hook-style reuse: a piece of behaviour, inlined into a machine, with a typed
contract. UML's "submachine state", a reusable composite state with typed entry and exit points, is
the closest prior art
([UML 15.3.11](https://site.uottawa.ca/~tcl/gradtheses/mnojoumian/ThesisFiles/FinalSpec/UML/15.3.11.html)).

## 2. The idea

A **fragment** is behaviour without identity. It declares states, events, memory, guards and
schedules, and is inlined into a host machine when the machine is constructed. The host stays one
actor with one mailbox, one turn and one plain snapshot, and everything compiles into one
representation ([FlowState.plan](../../FlowState.plan) D1).

```ts
export const Toggle = (p: { initial: boolean }) =>
  fragment(
    {
      id: "Toggle",
      events: { Toggle: {} },
      memory: { on: Schema.Boolean },
      initial: () => ({ on: p.initial }),
    },
    () => ({
      on: { Toggle: { target: "self", updateMemory: ({ memory }) => ({ on: !memory.on }) } },
    }),
  );
```

The smallest host: the definition places it under a name, and that name is how everything reaches
it.

```ts
const Editor = definition({
  id: "Editor",
  states: ["OPEN"],
  embeds: { pinned: Toggle({ initial: false }) } /* … */,
});

editor.send(Editor.E.pinned.Toggle());
useView(editor, (s) => s.memory.pinned.on);
```

### Which tool?

| Use                  | When                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Plain substates**  | the behaviour appears once, or only structures one machine                                                               |
| **A fragment**       | the same behaviour appears in more than one machine, needs no I/O of its own, and belongs in the host's mailbox and turn |
| **A separate actor** | it needs its own identity, lifetime, context or operations, or something else must address it                            |

Extract a fragment on the second use, not the first.

## 3. Machine versus fragment

A machine is behaviour plus everything needed to exist as an actor. A fragment is only the
behaviour.

|                                            | Machine                                          | Fragment                                                                   |
| ------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Identity                                   | id, refs, `ensureActor` / `createActor`          | none; exists only inside a host                                            |
| Mailbox and turns                          | its own                                          | its host's                                                                 |
| Lifetime                                   | created, retained, disposed                      | mounted: one entry of its state; embedded: its host's                      |
| Input and initial                          | `input` and `initial({ input })`, once per actor | parameters, and `initial({ props })`; mounted: every entry; embedded: once |
| Memory                                     | owns its memory                                  | owns one named slice; the host reads it and never writes it                |
| States, events, guards, updates, schedules | yes                                              | yes, under its instance name                                               |
| Operations, context, `onContext`, `send`   | yes                                              | no; the host does I/O and tells the fragment through props and events      |
| Persistence opt-in                         | yes                                              | no; saved as part of its host                                              |
| Ending                                     | never ends by itself                             | a callback prop whose host handler targets a state outside the mount       |
| Contains fragments                         | yes                                              | yes                                                                        |

A fragment can do everything inside one actor's head: states, memory, rules and timing. It cannot
touch the world: I/O, other actors, wiring, storage or identity. Section 8 explains why.

## 4. Mounted and embedded

The plans keep exactly one active leaf state per actor ([Machines.plan](../../Machines.plan) O2),
so reusable behaviour comes in two kinds:

- **Mounted**: a step in a flow (save with retry, a confirmation, a wizard step). It is placed as
  one of the host's states: `states: ["EDITING", { SAVE: CommitWithRetry(TicketRow, retry) }]`.
  Its states appear in the host's state path (`SAVE.WAITING`).
- **Embedded**: something that runs alongside every host state (a toggle, a field, a debounce). It
  is placed at the host's root: `embeds: { title: Field(Schema.String, rules) }`.

Rules:

- A fragment with states must be mounted. A fragment without states may be mounted (it then acts
  as one leaf state, like `Confirm`) or embedded.
- An embedded fragment has no mount to end. A host handler for one of its callbacks that targets a
  host state is an ordinary host transition from the host's current state.
- From outside a mount, only the mount itself can be targeted (`S.SAVE`), never one of its inner
  states (`S.SAVE.WAITING`), so a fragment is always entered through its default state and its
  `initial`.
- An orthogonal behaviour that needs states of its own would need parallel regions, which the plans
  exclude; it keeps its phase in memory instead (`level: "off" | "low" | "high"`).

## 5. Instance names

The key an embedded fragment is given (`title`, `pinned`), or the state name a mounted fragment is
given (`SAVE`), is the fragment instance's name. It is not memory itself. It gives:

| The name `check` gives                    | Example                               |
| ----------------------------------------- | ------------------------------------- |
| the fragment's memory slice               | `memory.check.seq`                    |
| its event namespace                       | `Rename.E.check.Input()`              |
| its schedules and activities, prefixed    | schedule `check.settle`               |
| where the host binds its props and guards | `embeds: { check: { props: { … } } }` |

The same fragment can be used several times under different names (`pinned`, `muted`). Names nest
for nested fragments (`E.ADDRESS.street.Changed`). An instance name that equals one of the host's
memory keys, event names or state names is a construction error.

## 6. The contract: props

Everything a host gives a fragment is a **prop**, as in React. There are two kinds:

- **Value props**, declared `prop<T>()`: data the fragment reads, computed by the host from its
  snapshot. The fragment reads them in callbacks as `({ props })`, like `memory`. A value prop
  declared `prop.optional<T>()` may be left unbound and then reads as `undefined`.
- **Callback props**, declared `callback<P>()`: something the fragment calls. The host binds a
  handler for it, which runs as part of the fragment's transition (section 7).

```ts
props: {
  delay: prop<Duration.Input>(),
  onSave: callback<{ value: string }>(),
},
```

Props are plain TypeScript types, not Schemas. Schemas belong where data crosses a boundary that
must be validated or encoded (events from outside, persisted memory, exported traces); props are
computed and consumed within one turn.

The fragment uses its props in its own handlers. A handler always has a target, as in any machine:

```ts
schedules: { autosave: { schedule: ({ props }) => props.delay, send: E.Due } },
Due: { target: S.SAVING, actions: [props.onSave.from(({ memory }) => ({ value: memory.draft }))] },
```

`props.onSave.from(f)` computes the payload from the handler's input (the pre-turn snapshot and
event), as other mappers do. A callback with no payload is used bare: `actions: [props.onClose]`.

The **definition places** fragments; the **machine binds** them, under the same instance name:

```ts
// definition
states: ["LIST", { NOTE: AutoSave(Schema.String) }, "ERROR"],
embeds: { pinned: Toggle({ initial: false }) },

// machine: a mounted fragment is bound under its state, an embedded one under embeds
NOTE: {
  props: {
    delay: ({ memory }) => memory.prefs.autosaveDelay, // value prop: a selector
    onSave: { actions: [saveNote] }, // callback prop: a handler
    onClose: { target: S.LIST }, // a handler that leaves the mount
  },
  guards: { Due: ({ context }) => context.canEdit || deny("ReadOnly") },
},
embeds: { pinned: { guards: { Toggle: ({ context }) => context.canEdit || deny("ReadOnly") } } },
```

A fragment that contains fragments binds their props and guards in its own build, the same way:
`embeds: { query: { props: { onChanged: { raise: [E.settle.Input] } } } }`. A handler written there
may call the enclosing fragment's own callbacks; they merge into the same combined transition.

Value-prop selectors receive the binding scope's pre-turn snapshot: for a machine, its `memory`,
`context` and `activities`; for an enclosing fragment, its `memory` and `props`. Callback handlers
receive the same, plus `payload`.

In a callback handler, the callback's data is `payload`, never `event`:
`onFailed: { target: S.ERROR, updateMemory: ({ payload }) => ({ error: payload.reason }) }`.

Types flow one way: the fragment declares its props, the definition places the fragment, and the
machine's bindings are typed from the definition, as event handlers are today. A binding never
widens the fragment's types.

## 7. Semantics

**One combined transition.** When a fragment transition calls callbacks, the fragment transition
and the host's handlers for those callbacks compile into one transition, evaluated on the pre-turn
snapshot in this order:

1. the host's injected guard for the event (`guards`), if any;
2. the fragment's own guard;
3. the guard of each called callback's handler, in call order;
4. the fragment's memory update, then each handler's memory update, in call order;
5. the fragment's actions, then each handler's actions, in call order;
6. the target: the fragment's, unless a handler targets a host state outside the mount, which
   then wins. That is how a mounted fragment ends. `flow check` errors when two handlers in one
   transition target different states.

If any guard declines, the whole transition declines and the event falls through to ancestors as
usual. It is still one turn and one publication. Callbacks called by a nested fragment's handler,
and by the enclosing fragments' handlers in turn, all join the same combined transition.

**Host guards are injected, not fallen back to.** `guards: { Due: … }` attaches to the fragment's
own handler for `Due`, whether the event is public or internal, and runs before the fragment's
guard. When that handler is a list of alternatives, the injected guard runs once, before any of
them. It does not use nearest-handler fallthrough. `check()` evaluates the same order and reports
the host's denial first. A denied schedule firing is consumed: a Duration schedule then stays idle
until it is restarted.

**Events.** A fragment's `events` are public and join the host's public events under the instance
name. Its `internalEvents` come from its own schedules, from the host's operation outcomes mapped
onto them, and from the host raising them. A host can make a fragment's public events internal:
`embeds: { pinned: { fragment: Toggle({ initial: false }), events: "internal" } }` in the
definition.

**Raising.** A transition may raise events to fragments it contains, `raise: [E.check.Input]` or
`E.title.Confirmed.from(f)`, handled in the same turn after all memory updates and before
publication. A raised event's handler runs like any fragment handler, including its callbacks,
but nothing it runs may raise again; `flow check` rejects such chains, so raising is at most one
step deep. Raising is how a host feeds data into a fragment and how fragments in one host are
connected.

**Starting work.** States have no entry actions. The host's transition into a mount carries the
first action (for example, the commit); the fragment asks again through a callback when it needs to
(for example, a retry).

**Memory.** The host reads fragment memory and never writes it (`updateMemory` cannot touch a
slice). A fragment's patch merges within its own slice. A mounted fragment's memory is created on
every entry to its mount, from `initial({ props })`, and removed when the mount is left; outside
its mount, `memory.SAVE` is typed as possibly absent. Re-entering a mount resets it. To keep data
across re-entry, the host stores results (from a callback's payload) and passes them back as a
prop that seeds `initial`. An embedded fragment initializes once, when its host is admitted, with
its props read from the host's initial snapshot. Fragments embedded inside a mounted fragment live
with that mount: they initialize on each entry of the mount and are removed when it is left.

**Fencing.** Each entry to a mount has a generation. Operation outcomes mapped onto a mounted
fragment's events carry the generation that started the operation; an outcome from an earlier
generation is not delivered to the fragment. It reaches the host's own handlers as a late event if
the host declares one, keyed by the fragment event's full name (`on: { "SAVE.Succeeded": … }`, a
typed key like any event name), and is otherwise dropped with evidence.

**Restore.** The saved state path includes fragment states and memory includes fragment slices;
restore resumes them with no re-initialization and no replay
([Persistence.plan](../../Persistence.plan) O4). An operation in flight restores as `unknown`
(Persistence O6), so a host that maps a commit's outcomes onto a fragment must map `unknown` too,
and `flow check` errors otherwise. Lookups re-subscribe on restore, so loading is modelled with an
activity, not a commit.

**Persistence shape.** A fragment's id, version and parameters that affect its Schemas (such as the
value Schema of `Field(Schema.String, …)`) are part of its host's saved shape and SSR shape digest.

**Schedules.** A schedule that reads props evaluates them when it is armed; a later prop change
does not retime it. `restartOn` sees `memory` and `context`, as in Machines O5, not props.

## 8. Why fragments do not do I/O

1. **The operation is what varies.** `CommitWithRetry` is reusable because it does not know what it
   commits.
2. **Operation inputs need host data**, which a fragment cannot see.
3. **Concurrency is per actor.** Commit policies apply per actor, operation and key
   ([Operations.plan](../../Operations.plan) O3); operations hidden in two fragments of one host
   would share a queue without either declaring it.
4. **One I/O list per actor.** The host's `operations` is what services, SSR settling, Attempt
   durability, Story fixtures, `flow check` and the graph read.

So the host owns every subscription, commit and side effect. A fragment asks for them through
callbacks and learns their results through its own internal events, which the host's outcome
mappings target. Something that needs its own operations, context and lifetime is a machine, used
as a separate actor.

## 9. Static analysis

XState's maintainers advise against sharing state configuration because Stately's tools read source
code: a parser cannot follow a spread config or a state built by a function call
([statelyai/xstate#3283](https://github.com/statelyai/xstate/discussions/3283)). That does not apply
here. `inspect(app)` and `flow check` construct the app and read its compiled representation
([Inspection.plan](../../Inspection.plan) O1). Fragments compile into it: callbacks and injected
guards merge into ordinary transitions, so graphs, `check()`, models, coverage and Stories see
ordinary states and edges, tagged `fragment: { id, instance }` so graphs can collapse them.

Three things need care:

- **Deny codes come from TypeScript types** ([Inspection.plan](../../Inspection.plan) D2). Injected
  guards and callback handlers are host code, read like any guard. In generic fragments a deny code
  must stay a literal type; `const` type parameters keep it so.
- **Type-level cost.** Nested names and generic fragments push on inference
  ([statelyai/xstate#4697](https://github.com/statelyai/xstate/discussions/4697)). The S1 type spike
  should test this first, and bindings must take their types from the definition (`NoInfer`).
- **Fragment factories must be pure and deterministic**, because construction calls them.

## 10. Testing

A fragment can be tested on its own with `fragmentStory(fragment, { props })`: value props are
fixed, callback calls are recorded with their payloads, and operation outcomes are delivered by
raising the fragment's internal events. Small fragments with small memory can be explored
completely with models; fragments with free-form values need a `stateKey` like any machine.

A host still needs integration Stories. Fragment tests prove the fragment's behaviour; the host
must still prove its wiring, permissions, cancellation, re-entry, persistence and concurrent
outcomes, as the rules in section 7 interact there.

## 11. What it unlocks, and what it costs

- **Machines become assembly**: a parts list of behaviours plus what is specific to the host.
- **A design system for behaviour**: `Confirm`, `Field`, `Debounce`, `CommitWithRetry` shared like
  UI components, so a fix lands everywhere and policy is consistent by construction.
- **Forms and multi-step flows** become fields and steps wired together.
- **Agents assemble instead of invent**: choosing fragments and binding typed props is easier to
  get right and to check; `flow check` catches unbound callbacks and conflicting targets.
- **Diagrams with zoom levels**, coverage per fragment, and extract or inline refactoring that does
  not change compiled behaviour.

Costs: indirection when reading a machine; over-fragmenting (a lint can flag fragments used once);
inference cost for generic fragments; versioning of shared fragments; new machine rules (combined
transitions, injected guards, raising, mount generations); and the single-active-state limit, which
still applies.

## 12. Version 1, open questions and plan changes

Nothing in version 1 needs fragments. They would come after the core Runtime stage (S3), proved
first by converting the editor's lock retry and the queue's poll backoff into one shared fragment.

Open questions:

1. **Helper names**: `prop<T>()`, `callback<P>()`, `raise`, `payload`, and whether callback names
   must start with `on`.
2. **Unbound callbacks**: callbacks that can end a mount must be bound; should others warn or be
   optional by declaration?
3. **Parameters**: plain values, or Schema-encodable so inspection can record them?
4. **Fragment versions**: how a fragment's version is declared and fed into its host's persistence
   version.

Plan changes, once accepted:

- **[Machines.plan](../../Machines.plan) O1, O2, O3:** `fragment`, `embeds`, mounting, instance
  names, props, combined transitions and their order, injected guards, `raise`, no direct targets
  into a mount.
- **Machines O5, O6, O8:** schedules and activities owned by a fragment, props read at arm time,
  nested memory slices and fragment states in snapshots.
- **[Runtime.plan](../../Runtime.plan):** mount generations and fencing of outcomes.
- **[Operations.plan](../../Operations.plan):** outcome mappings onto fragment events, including
  the required `unknown`.
- **[Testing.plan](../../Testing.plan):** `fragmentStory`.
- **[Persistence.plan](../../Persistence.plan), [ServerRendering.plan](../../ServerRendering.plan):**
  fragment ids, versions and parameters in the saved shape and the shape digest.
- **[Inspection.plan](../../Inspection.plan), [CommandLine.plan](../../CommandLine.plan):** fragment
  tags, collapsed graphs, and checks for conflicting targets, unbound callbacks, unmapped `unknown`
  and name collisions.
- **[Package.plan](../../Package.plan):** `fragment`, `prop`, `callback`, and `fragmentStory`.
- **[FlowState.plan](../../FlowState.plan):** a build stage after S3.
