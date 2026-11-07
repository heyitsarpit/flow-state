# Fragments: reusable machine behaviour

Status: proposal, not accepted: the single-fragment proposal, where one `fragment` concept covers
everything. It is prior art for [machine-fragments/](../machine-fragments/fragments-problem.md), which splits
fragments into traits and subroutines; its decisions D1–D13 are evidence there, not rules. No plan has been changed for it. Where this document and a plan differ, the plan wins.

Companion files: [fragment-examples.md](fragment-examples.md) holds the full code of every fragment;
[fragment-contract-syntax.md](fragment-contract-syntax.md) records how this contract syntax was
chosen.

The API is being simplified feature by feature, judged by how easily the code reads at a glance.
Settled decisions are recorded in section 13, and section 14 holds the current baseline syntax:
where it differs from sections 6 and 7 or from the catalogue, section 14 wins. Sections 6 and 7
still describe the earlier, fuller contract until the review reaches each feature.

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
representation ([FlowState.plan](../../../flow/FlowState.plan) D1).

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

The plans keep exactly one active leaf state per actor ([Machines.plan](../../../flow/Machines.plan) O2),
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
([Persistence.plan](../../../flow/Persistence.plan) O4). An operation in flight restores as `unknown`
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
   ([Operations.plan](../../../flow/Operations.plan) O3); operations hidden in two fragments of one host
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
([Inspection.plan](../../../flow/Inspection.plan) O1). Fragments compile into it: callbacks and injected
guards merge into ordinary transitions, so graphs, `check()`, models, coverage and Stories see
ordinary states and edges, tagged `fragment: { id, instance }` so graphs can collapse them.

Three things need care:

- **Deny codes come from TypeScript types** ([Inspection.plan](../../../flow/Inspection.plan) D2). Injected
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

- **[Machines.plan](../../../flow/Machines.plan) O1, O2, O3:** `fragment`, `embeds`, mounting, instance
  names, props, combined transitions and their order, injected guards, `raise`, no direct targets
  into a mount.
- **Machines O5, O6, O8:** schedules and activities owned by a fragment, props read at arm time,
  nested memory slices and fragment states in snapshots.
- **[Runtime.plan](../../../flow/Runtime.plan):** mount generations and fencing of outcomes.
- **[Operations.plan](../../../flow/Operations.plan):** outcome mappings onto fragment events, including
  the required `unknown`.
- **[Testing.plan](../../../flow/Testing.plan):** `fragmentStory`.
- **[Persistence.plan](../../../flow/Persistence.plan), [ServerRendering.plan](../../../flow/ServerRendering.plan):**
  fragment ids, versions and parameters in the saved shape and the shape digest.
- **[Inspection.plan](../../../flow/Inspection.plan), [CommandLine.plan](../../../flow/CommandLine.plan):** fragment
  tags, collapsed graphs, and checks for conflicting targets, unbound callbacks, unmapped `unknown`
  and name collisions.
- **[Package.plan](../../../flow/Package.plan):** `fragment`, `prop`, `callback`, and `fragmentStory`.
- **[FlowState.plan](../../../flow/FlowState.plan):** a build stage after S3.

## 13. Decisions

Settled while simplifying the API feature by feature. Each records the choice, why, what it
commits to, and what was rejected.

**D1. Fragments may contain fragments.** A fragment can mount fragments in its states and embed
fragments at its root, under the same placing rules as a machine. Composite behaviour (a typed
confirmation built from a field, an address step built from fields) is then written once and reused
as one piece, and nesting adds no runtime rule because everything is still expanded into the host
at construction. Rejected: flat fragments only, which would make every host rebuild composite
behaviour itself.

**D2. Nested names are visible.** A nested fragment's names extend its parent's:
`E.ASK.typed.Changed`, `memory.ASK.typed.value`, state path `ASK.typed`. Paths read plainly and need
no forwarding. Consequence: inner structure is part of the outer fragment's interface, so renaming
an inner part changes code that reaches it. Rejected: private nested fragments re-exported through
the outer fragment's own events, which costs an extra event and forwarding for every exposed
action.

**D3. No limit on nesting depth** beyond the existing ten-segment state path limit, and no
warning. Deep nesting is rare, and a warning would flag legitimate designs. Rejected: a hard limit
of two levels, and a `flow check` warning beyond two levels.

**D4. Fragments ask hosts to act through declared callbacks.** A fragment declares each moment a
host may react to as a callback (`callback`, a new keyword) with a typed payload, calls it from its
own handlers (`actions: [props.onSettled]`), and the host binds a handler for each. The fragment
owns its contract: it declares what it needs to work correctly, and the host adapts to it. This
gives an explicit, typed interface, lets a fragment change its internal events without breaking
hosts, and lets `flow check` verify that required callbacks are bound. Rejected: hooks, where a
host attaches to any fragment event with `on`, because every internal event would become interface;
and fallthrough only, which cannot express a fragment that changes its own state and needs the
host to act on the same event. The name `props` may still change.

**D5. A mounted fragment ends only through declared exits.** The fragment declares its ways out
(`exits`, a new keyword) and takes one as a transition; the host maps every exit at the mount. A
callback's host handler in a mounted fragment may act (actions, memory updates) but never targets a
host state, so the rule "a host target outside the mount wins" disappears. Embedded fragments have
no exits, and their callback handlers may target host states. Reason: reading the fragment alone
shows when it finishes; under version 5 a handler said `target: "self"` while the actor left.
Rejected: ending through a callback whose host handler targets outside the mount. See D7 for syntax.

**D6. The fragment owns its contract.** A fragment declares everything it needs and everything it
offers (values, callbacks, exits, and any host policy it relies on), and the host adapts to that
declaration. Every remaining feature is decided under this rule unless a case clearly argues
otherwise. Reason: one place to look to know what a fragment needs and what it does.

**D7. Exit syntax.** The fragment declares `exits: { Confirmed: {}, Failed: { reason } }`, receives
`exits` in its build function beside `S`, `E` and `props`, and takes one as a transition:
`Yes: exits.Confirmed`, or `exits.Failed.from(({ memory }) => ({ reason: memory.error }))` when the
exit carries data. The host maps each exit at the mount, to a state (`Confirmed: S.DELETING`) or,
when it also acts, to `{ target, actions?, updateMemory? }`. Rejected: version 1's `X.Confirmed`,
because `X` has to be learned; and always writing the long form, which is noise for the common case.

**D8. No `bind` keyword.** Where the machine supplies anything per placed fragment, the block stays
named `embeds`. Rejected: `bind`. The inverted model that would remove the block is rejected in D9.

**D9. Fragments hide their implementation; the host cannot reach inside.** Rejected: the inverted
model, where placing a fragment copies its states, events and memory into the host, and the host
may handle any fragment event in its own `on`, guard it, and write fragment memory. It would remove
`props`, `callback`, `guard()`, `exits` and the machine-side `embeds`, but every fragment event and
memory field would become interface. Interfaces would then grow with nesting depth: a host could
reach past `SearchBox` into its `Debounce`. Swapping an inner fragment would break hosts, and a
middle layer could guarantee nothing. Hiding implementation and complexity is the point of
fragments, so D6 stands: names stay readable (D2), but behaviour is reached only through what each
fragment declares. Also rejected: inversion limited to the fragments a host placed directly, which
keeps one layer of hiding at the cost of a "you can touch what you placed" rule.

**D10. Host policy reaches a fragment only through guard props the fragment declares.** A fragment
declares `canEdit: guard()` among its props, puts `guard: props.canEdit` on the transitions it
protects, and the host supplies the check (`canEdit: ({ memory }) => !memory.locked ||
deny("Locked")`). Correctness comes before brevity: only the fragment knows where refusing an event
is safe. `HoldToConfirm` relies on `Release` always following `Press`; a host that could refuse
`Release` would leave it holding, and `Held` would confirm a delete the user abandoned. Declared
guards also keep one standard contract (everything a fragment needs is a prop) and let
`fragmentStory` test refusal in isolation by passing a denying guard. Cost: a host cannot add a
check the author did not foresee; the fix is to change the fragment. Rejected: guards injected per
public event, because they can break fragments like `HoldToConfirm`; a gate on the whole instance,
for the same reason; a `guardable` list of events, which is harder to read and no more correct; and
guarding only at the boundary, which does not enforce anything inside an embedded fragment.

**D11. Only the host sends into its fragments; anyone may read them.** No view or other actor can
send a fragment's events: `editor.send(TicketEditor.E.title.Set(…))` is a type error and is refused
at runtime. The UI sends the host's own events, and the host forwards them with `raise`. A
fragment's memory and states stay readable from outside (`s.memory.title.value`,
`S.DELETE_ASK.is(s)`), and nothing outside the fragment can write them (D9). Reason: if only the
host sends, it controls every input, so a host that saves before toggling a pinned flag cannot be
bypassed by a direct send. Reading cannot change behaviour, and hiding memory would force hosts to
copy fragment values into their own memory, where the copies drift (for example, a copied error
that starts as `null` while the field starts as "Required"). Costs: one host event and one
forwarding line for each fragment event the UI drives, `raise` becomes required (feature 6), and a
component that reads a fragment's memory breaks if the fragment renames it. Rejected: public events
decided by the fragment; a host option to make a placement's events internal; private by default
with an opt-in to public; and everything private, including memory and states.

**D12. Two concepts, not one.** What "fragment" covered splits into two constructors with separate
rules. One is always there: no states of its own, never ends, kept for the host's life, placed in
`embeds` (field, toggle, debounce). The other is entered and left: may have states, ends only
through exits, fresh memory and stopped timers on every entry, late results from an earlier entry
rejected, placed as a host state (confirmation, picker, wizard step, save with retry). Each
constructor accepts only what its kind can use, and the types refuse the wrong placement. Reason:
most conditional rules so far came from one concept covering both (D5's two cases, exits offered to
both, "a stateless fragment may be mounted or embedded", props bound in two places, mount
generations met by every reader). Shared by both: props, callbacks, guards, instance names, D9 and
D11. Not fixed by the split: forwarding through nesting, `raise`, async results, testing. Rejected:
one `fragment` with a written rule for choosing a placement. Names are still open.

**D13. Names: `trait` and `subroutine`; "machine fragment" is only a word for both.** The
always-there kind is a **trait** (`trait(...)`): behaviour an actor gains, as in Scala or PHP
traits, which carry state. The step kind is a **subroutine** (`subroutine(...)`): entered, runs on
its own, and returns a named result through its exits. "Machine fragment" stays as the umbrella
term in prose for both, with no API of its own; there is no `fragment(...)` constructor. Rejected:
`behavior` and `step` (they do not say what each is); `submachine` (in the plans a machine has its
own actor, and these are inlined); `mixin`, `facet`, `slice`, `subflow`, `subchart` and keeping
`fragment` for one of the two.

## 14. Baseline syntax

The accepted baseline after D1–D13. Every later change is made against this example. Lines marked
`// OPEN:` are still under review; everything else is accepted.

Keywords: `trait`, `subroutine`, `embeds`, `exits`, `props`, `prop`, `callback`, `guard()` and `.from` are new;
`definition`, `machine`, `states`, `events`, `internalEvents`, `memory`, `initial`, `input`,
`operations`, `default`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`,
`restartOn`, `deny`, `S`, `E` and `O` already exist in the plans. Every other name is chosen by the author.

```ts
// fragments.ts
import { trait, subroutine, prop, callback, guard } from "flow-state";
import { Schema, Duration } from "effect";

// ── Debounce (trait): fires once, `wait` after the last Input ───────────────
export const Debounce = (p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      events: { Input: {} },                       // sent from outside
      internalEvents: { Due: {} },                 // only this trait's schedule sends it
      memory: { seq: Schema.Int },
      initial: () => ({ seq: 0 }),
      props: { onSettled: callback() },            // OPEN: TS generics vs Schema for shapes
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

// ── TitleField (trait): a text value plus a debounced "settled" signal (D1) ──
export const TitleField = trait(
  {
    id: "TitleField",
    embeds: { check: Debounce({ wait: "300 millis" }) },   // a trait inside a trait
    events: { Set: { value: Schema.String } },
    memory: { value: Schema.String },
    props: {
      start: prop<string>(),
      onSettled: callback<{ value: string }>(),            // OPEN: required vs .optional
      canEdit: guard(),                                    // D10: host policy, where the trait allows it
    },
    initial: ({ props }) => ({ value: props.start }),
  },
  ({ E, props }) => ({
    // TitleField supplies its own child's props: the host never sees Debounce's onSettled (D9)
    embeds: {
      check: {
        props: {
          onSettled: { actions: [props.onSettled.from(({ memory }) => ({ value: memory.value }))] },
        },
      },
    },
    on: {
      Set: {
        target: "self",
        guard: props.canEdit,
        updateMemory: ({ event }) => ({ value: event.value }),
        raise: [E.check.Input],                            // OPEN: raise (feature 6)
      },
    },
  }),
);

// ── Confirm (subroutine): entered as a host state, two ways out (D5, D7) ────
export const Confirm = subroutine(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    exits: { Confirmed: {}, Declined: {} },               // OPEN: name (exits / returns)
  },
  ({ exits }) => ({
    on: {
      Yes: exits.Confirmed,
      No: exits.Declined,
    },
  }),
);
```

```ts
// ticket-editor.definition.ts: structure; produces S, E and the types the UI uses
import { definition } from "flow-state";
import { Schema } from "effect";
import { Confirm, TitleField } from "./fragments";

export const TicketEditor = definition({
  id: "Desk/TicketEditor",
  states: ["VIEWING", { DELETE_ASK: Confirm }, "DELETED"],    // subroutine: instance name DELETE_ASK
  embeds: { title: TitleField },                              // trait: instance name title
  events: {
    Delete: {},
    SetTitle: { value: Schema.String },    // D11: the UI sends these; the host forwards them
    ConfirmDelete: {},
    CancelDelete: {},
  },
  input: { ticketId: Schema.String, title: Schema.String, locked: Schema.Boolean },
  memory: { ticketId: Schema.String, original: Schema.String, locked: Schema.Boolean },
  initial: ({ input }) => ({ ticketId: input.ticketId, original: input.title, locked: input.locked }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-editor.machine.ts: behaviour
import { machine, deny } from "flow-state";
import { TicketEditor } from "./ticket-editor.definition";

export const TicketEditorMachine = machine(TicketEditor, ({ S, E, O }) => {
  const deleteTicket = O.Tickets.delete.commit(({ memory }) => ({ ticketId: memory.ticketId }));
  const checkTitle = O.Tickets.titleTaken.refetch(({ payload }) => ({ title: payload.value }));

  return {
    default: S.VIEWING,
    embeds: {                                                 // D8: supplies what title declared
      title: {
        props: {
          start: ({ memory }) => memory.original,
          onSettled: { actions: [checkTitle] },
          canEdit: ({ memory }) => !memory.locked || deny("Locked"),
        },
      },
    },
    on: {
      SetTitle: {
        target: "self",
        raise: [E.title.Set.from(({ event }) => ({ value: event.value }))],   // OPEN: raise (feature 6)
      },
    },
    states: {
      VIEWING: { on: { Delete: S.DELETE_ASK } },
      DELETE_ASK: {
        on: {
          ConfirmDelete: { target: "self", raise: [E.DELETE_ASK.Yes] },
          CancelDelete: { target: "self", raise: [E.DELETE_ASK.No] },
        },
        exits: {                                              // OPEN: this, or on: { "DELETE_ASK.Confirmed": … }
          Confirmed: { target: S.DELETED, actions: [deleteTicket] },
          Declined: S.VIEWING,
        },
      },
      DELETED: {},
    },
  };
});
```

```tsx
// a component: sends only the host's events (D11), reads fragments directly
editor.send(TicketEditor.E.SetTitle({ value: "New title" }));
editor.send(TicketEditor.E.Delete());
editor.send(TicketEditor.E.ConfirmDelete());
// editor.send(TicketEditor.E.title.Set({ value: "x" }));   // type error: only the host sends into title
useView(editor, (s) => s.memory.title.value);
useView(editor, (s) => TicketEditor.S.DELETE_ASK.is(s));
useView(editor, (s) => s.memory.title.check.seq);   // readable (D2), but nothing can write it (D9)
```

What the baseline fixes:

- **Two kinds** (D12, D13): a trait is always there, has no states, never ends and goes in
  `embeds`; a subroutine is entered as a host state, may have states and ends through `exits`.
- **Placement** is structure, in the definition: subroutines in `states`, traits in `embeds`. The
  placement's key is the instance name that namespaces events, memory and states.
- **Supplying** is behaviour, in the machine's (or host trait's) `embeds` block for traits and on
  the subroutine's state for subroutines, because props refer to `S`, `E` and `O`.
- **Callbacks act and never move the actor out of a mount;** only exits end a mount. Nobody sends
  an exit: the subroutine takes it.
- **A machine fragment that hosts others supplies their props itself,** so the outer host sees only
  the outer one's contract.

- **Host policy enters only through declared `guard()` props** (D10).
- **Only the host sends into its fragments; anyone may read their memory and states** (D11).

Open, in review order: host-side exit
handling and the exit name; required and optional props; Schema or TypeScript for prop shapes;
`raise` (feature 6); async results (feature 7); `fragmentStory` (feature 9).
