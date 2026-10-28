# Prior art for dynamic collections: UI frameworks, app-state libraries and entity systems

Status: research note for [problem.md](problem.md). It builds on
[../prior-art/README.md](../prior-art/README.md), which already matched v3's keyed lists to Redux
normalised entities and Céu pools, and recorded that BT and StateTree run "one tree instance per
entity". This note goes one level deeper into **how each system creates, addresses, times and
retires copies**, and what that means for the open `.list` (v4 rule 9).

Claims marked *(recall)* are from memory of the system and were not re-checked against a source in
this pass. Everything else cites a primary source.

## 0. Summary

Every system here that keeps one static structure **separates three things that v4's `.list` mixes**:

1. **Membership is ordinary data the owner writes.** React children come from `items.map(…)`,
   Elm sub-models from a `List`, Redux entities from `ids`, ECS entities from spawn and despawn
   commands. None of them has an `Add` event *on the collection*. The owner writes the list; the
   framework reconciles.
2. **Identity is a key plus an incarnation, and only the key is public.** React's key, Svelte's
   `(item.id)`, Redux's `selectId` are public; the life behind the key is private (React fiber,
   Solid owner, Bevy `index + generation`, Unity `Index + Version`). Re-adding a key makes a new
   life, and nothing old reaches it.
3. **Behaviour is written once, over every copy.** An ECS system, a StateTree asset, a React
   component, an Elm `update` all describe one copy; the runtime holds per-copy data. Analysis is of
   the one description, not of N copies.

Timers are where the systems split. **Declarative timers** (Elm subscriptions, React effects with
cleanup, Bevy `Timer` components) stop on removal by construction: they are a function of what
exists. **Imperative timers with a captured handle** (Elm `Process.sleep`, XState `after`, a
`setTimeout` in a callback) need a manual fence, the "ignore flag" React's docs teach. Flow's
schedules are already declarative (armed on entry, cancelled on leaving), so they fit the first
group.

The strongest direction for Flow State (D1 in section 5) is **React's model moved into the turn**:
the host keeps the ids as its own memory; the machine says "one `Field` per id"; the turn reconciles
copies by id at the point where `resetOn` already runs. That removes `Add`, `Remove`, `owner`,
`canAdd`, `canRemove` and minted keys from the API, keeps incarnations private, and gives C6 plain
data with no machinery.

## 1. The systems

### 1.1 The Elm Architecture

**N copies.** A list of sub-models in the parent model, `List (Id, Row.Model)` or a `Dict`. The
parent's `update` maps a wrapped message `RowMsg id Row.Msg` onto the right row with `List.map` or
`Dict.update`. The view maps each row's `Html Row.Msg` into the parent's message with `Html.map`.
The official guide discourages this shape for things that need no behaviour of their own:
"actively trying to make components is a recipe for disaster in Elm"
([guide: structure](https://guide.elm-lang.org/webapps/structure)).

- **Creation and removal:** the parent writes its list. There is no framework-level membership.
- **Identity:** whatever id the author stores. The DOM is matched by key only if the view uses
  `Html.Keyed`, which pairs "every child … with a string identifier" so the diff can reuse nodes
  ([Html.Keyed source](https://github.com/elm/html/blob/master/src/Html/Keyed.elm)). Keys affect
  DOM reuse only; model identity is the author's.
- **Addressing:** the wrapped message carries the id. A message for an id that is no longer in the
  list is ignored by the lookup (`Dict.update` on a missing key does nothing).
- **Timers per copy, two ways:**
  - **Subscriptions** are a pure function of the model, `subscriptions : Model -> Sub Msg`. A
    per-row timer is `Sub.batch (List.map rowSub model.rows)`. The runtime diffs subscriptions after
    every update, so removing a row stops its timer by construction *(recall: the effect manager
    diffs subscriptions per update; `Time.every` groups by interval)*.
  - **One-shot delays** are `Task.perform` over `Process.sleep`
    ([Process](https://github.com/elm/core/blob/master/src/Process.elm)). They cannot be cancelled
    unless spawned and killed, so the standard debounce stores a counter in the row and ignores a
    firing whose counter is stale *(recall: the common community debounce pattern)*. That counter is a
    hand-written incarnation.
- **Late events for removed copies:** dropped by lookup. **A re-added id receives a stale message**
  unless the author adds a generation counter. Elm does not fence.

**Static structure.** The types are static: `Row.Msg` and `Row.Model` are known at compile time, and
the parent's message type has one constructor for "a message to row id". The number of rows is
data.

**Atomic step.** One `update` call is one step. The parent can add a row and send it its first
message in the same step only by calling `Row.update` directly in its own `update`; there is no
"raise". Ordering among rows is whatever the author's `List.map` does.

**Cost and pitfalls.** Boilerplate per level (`RowMsg`, `Html.map`, `Cmd.map`, `Sub.map`). The
forwarding cost is the A1 failure mode the earlier prior-art note named. The stale-message hole on
re-add is real and silent.

### 1.2 React keyed children

**N copies.** `items.map(item => <Row key={item.id} …/>)`. State lives in React, attached to a
position in the tree: "React preserves a component's state for as long as it's being rendered at its
position in the UI tree. If it gets removed … React discards its state"
([preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state)). "Specifying
a `key` tells React to use the key itself as part of the position, instead of their order within the
parent" (same page).

- **Creation and removal:** the parent's data decides. A new key mounts a fresh instance with
  initial state; a missing key unmounts and discards its state; the same key keeps its state across
  reorders. Index keys mix up state on reorder: instances "are updated and reused based on their
  key", so state "can get mixed up" ([reconciliation](https://legacy.reactjs.org/docs/reconciliation.html)).
- **Identity:** the key, unique among siblings only. A **changed key forces a fresh instance**
  ("You can force a subtree to reset its state by giving it a different key"), which is exactly
  Flow's `resetOn` for one placement.
- **Re-adding a key** after it was removed in an earlier render makes a new instance with fresh
  state. Removing and re-adding **within one render** is invisible: the key is present before and
  after, so the instance is kept.
- **Addressing:** none built in. Parent-to-child is props; child-to-parent is a callback prop closed
  over the id (`onPin={() => pin(item.id)}`).
- **Timers per copy:** an effect with cleanup. Cleanup runs "one final time when the component
  unmounts", and the docs show a timeout cleared before it fires
  ([synchronizing with effects](https://react.dev/learn/synchronizing-with-effects)).
- **Late events:** async results are fenced by hand: "Each render's Effect has its own `ignore`
  variable … if an Effect gets cleaned up … its `ignore` variable becomes `true`" (same page). That is
  a per-incarnation fence written by the author.

**Static structure.** The component type is static; the instance count is data. React has no
whole-tree analysis.

**Atomic step.** A render plus commit is one step: the parent's state change, every child mount,
update and unmount, and effect cleanups are committed together. Ordering among children is tree
order. Effects run after commit, so a new child's first effect sees the committed tree.

**Cost and pitfalls.** Very low concept count (one key). Pitfalls: index keys; state you meant to
reset survives because the key did not change; async results landing after unmount or on a re-added
key unless fenced; lifting a child's state to the parent loses the per-child lifecycle.

### 1.3 Solid `<For>` / `<Index>` and Svelte keyed `{#each}`

**Solid.** `<For>` "maps items by value identity"; when the same value moves, "its rendered node can
be moved instead of recreated"; `item` is a plain value and `index` is an accessor
([For](https://docs.solidjs.com/reference/components/for)). `<Index>` "maps items by index rather
than by value identity"; `item` is an accessor and positions stay tied to indexes
([Index](https://docs.solidjs.com/reference/components/index-component)). Both build on
`mapArray` / `indexArray`, which create a reactive **owner per row** and dispose it, running the
row's `onCleanup`, when the row leaves *(recall: disposal semantics of `mapArray`)*.

So Solid offers the two identity choices explicitly: **by key, data is fixed and position moves**
(`<For>`), or **by slot, position is fixed and data moves** (`<Index>`). Per-row timers live in the
row's owner and stop on disposal.

**Svelte.** `{#each items as item (item.id)}`; the key must "uniquely identify each list item", and
Svelte uses it to insert, move and delete instead of rewriting the tail
([each](https://svelte.dev/docs/svelte/each)). Without a key, items are updated in place by index,
the same trap as React index keys.

**Static structure, step, cost.** As React: the row component is static, the count is data, and
one reactive flush applies all changes. Fine-grained reactivity makes per-row reads cheap: a view
that reads row 3 does not re-run for row 4. Pitfall: `<For>` keys by object reference, so replacing
an object with an equal copy remounts the row.

### 1.4 Redux Toolkit `createEntityAdapter`

**N copies of data, not behaviour.** State is `{ ids: [], entities: {} }`; `selectId` defaults to
`entity => entity.id`; with `sortComparer`, "the `state.ids` array will be kept in sorted order",
otherwise "no guarantees are made about the ordering"
([createEntityAdapter](https://redux.js.org/toolkit/api/createEntityAdapter)).

- **Membership:** `addOne`, `setOne`, `upsertOne`, `removeOne`, `setAll`, … as case reducers or
  helpers. Adding an existing id with `addOne` "will do nothing"; `setOne` replaces; `upsertOne`
  merges. An update for a missing id is "silently ignored" (same page).
- **Reading:** `selectAll` returns entities in `ids` order; `selectById` returns the entity or
  `undefined`.
- **Timers, behaviour, late results:** none. Per-row async state is written as fields
  (`status: "pending"`), and stale results are fenced by the author, typically with `requestId`
  from `createAsyncThunk` *(recall)*.

**Static structure.** The entity type is static. Every reducer sees every action
(`combineReducers`), so there is no addressing, only filtering by id.

**Atomic step.** One action, one reducer pass: membership and the host's other fields change
together. There is nothing per row to order.

**Cost and pitfalls.** Minimal concepts for C6. Nothing for C1–C5: per-row timers move into
middleware or components. Shallow updates only.

### 1.5 Entity Component Systems: Bevy, Unity DOTS (Entities), Unreal Mass

**N copies.** An entity is an id; components are data attached to it; a **system** is one function
over every entity that has a given set of components. Mass says it plainly: fragments are "an atomic
piece of data", entities and fragments hold no logic, and processors are "stateless classes" that
declare an entity query and receive batches of fragments
([Mass overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-entity-in-unreal-engine)).
Mass **traits** add and configure fragments and processors on an entity template; StateTree is one
such trait (same page).

- **Creation and removal: structural changes are deferred.** A running system cannot change which
  entities exist, because that would move entities between archetypes mid-iteration. Mass queues
  them in `MassCommandBuffer` and runs them "in batch at the end of the current processing pass"
  (same page). Bevy queues `Commands` and applies them, in the order queued, when `ApplyDeferred`
  runs ([Commands](https://docs.rs/bevy/latest/bevy/ecs/prelude/struct.Commands.html)); since 0.13
  Bevy "detects when a system with commands is ordered relative to other systems and inserts the
  `apply_deferred` for you" ([0.13 release](https://bevy.org/news/bevy-0-13/)). Unity's
  `EntityCommandBuffer` does the same; entities created in a buffer are temporary handles that later
  commands in the same buffer may use, and are replaced with real entities at playback
  ([ECBs](https://docs.unity3d.com/Packages/com.unity.entities@1.3/manual/systems-entity-command-buffers.html)).
- **Identity: index plus generation.** A Bevy `Entity` is an index and a generation; the generation
  "is incremented each time an entity with a given index is despawned", so an old handle and a new
  entity at the same index differ; the docs warn not to "assume the Entity id corresponds to the
  same entity it originally did" ([Entity](https://docs.rs/bevy/latest/bevy/ecs/entity/struct.Entity.html)).
  Unity's `Entity` is `Index + Version`, the same idea *(recall)*. **The generation is private
  runtime identity; game code holds the handle and the runtime checks it.**
- **Addressing:** by handle (`query.get(entity)`, `commands.entity(e)`), or by query (every entity
  with these components). A command on a despawned entity fails; Bevy routes command errors to an
  error handler whose fallback panics, and offers `try_` variants that skip silently *(the `try_`
  variants are recall)*.
- **Timers per copy are data.** A Bevy `Timer` is a plain struct put in a component and ticked by one
  system with the frame delta *(recall)*. Mass and DOTS do the same with a remaining-time field.
  Removing the entity removes the timer: **there is nothing to cancel**. Delayed per-entity wake-ups
  in Mass go through the signal subsystem (`DelaySignalEntity`), keyed by entity handle *(recall)*.
- **Per-copy modes** are tags (data-less components) or, in DOTS, **enableable components** that
  toggle without a structural change *(recall)*. A mode is therefore still data on the copy.
- **Lifecycle hooks:** Bevy component hooks and observers run on add, insert, replace and remove
  *(recall: names changed across 0.14–0.17)*. They are the ECS form of `onLeave`.

**Static structure.** The **set of component types and systems is static**: the schedule (which
systems run, in what order, reading and writing which components) is a graph known before the first
frame, and Bevy uses those declared accesses to run systems in parallel safely *(recall)*. What is
dynamic is only which entities exist. A system is analysed once, for "an entity with these
components", never per entity. This is the clearest precedent for K2: **the graph has one copy of the
behaviour, marked "for every id"**.

**Atomic step.** A frame is not atomic, but the **command buffer gives a precise sync point**:
systems before the sync point see the old entity set; structural changes apply together; systems
after see the new set. Ordering among copies within a system is query iteration order, which is an
implementation detail and, when recorded in parallel, nondeterministic: "the order of the commands is
non-deterministic because they depend on job scheduling", fixed by recording a **sort key** so that
"Unity always plays back commands with larger sort keys after commands with smaller sort keys"
([ECB playback](https://docs.unity3d.com/Packages/com.unity.entities@1.3/manual/systems-entity-command-buffer-playback.html)).

**Cost and pitfalls.** Powerful and fast, but a different style: behaviour is spread over systems by
component, not kept per thing (weak K9 at the copy level). Pitfalls: the one-frame delay between
queuing a spawn and seeing it; stale handles after reuse; nondeterministic ordering unless sorted;
entity ids that are not stable across runs, so Bevy warns serialised ids may not round-trip
([Entity](https://docs.rs/bevy/latest/bevy/ecs/entity/struct.Entity.html)).

### 1.6 Behavior trees and Unreal StateTree

**N copies.** The **asset is shared, memory is per instance.** Unreal's behavior tree nodes are
templates shared by all agents, each running tree has a per-node memory block, and nodes can opt
into per-instance objects *(recall, as in the earlier note)*. StateTree's instance data "is used to
store the runtime state of a StateTree"
([FStateTreeInstanceData](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/StateTreeModule/FStateTreeInstanceData)),
and a reference to a task's instance data is valid "only during the lifetime of a task (between a
call EnterState() and ExitState())"
([FStateTreeInstanceStorage](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/StateTreeModule/FStateTreeInstanceStorage)).
In Mass, a fragment holds a "Handle to a StateTree instance data in MassStateTreeSubsystem"
([FMassStateTreeInstanceFragment](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassAIBehavior/FMassStateTreeInstanceFragment)),
and the subsystem spawns one processor per asset to run every entity using it
([UMassStateTreeSubsystem](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassAIBehavior/UMassStateTreeSubsystem)).

- **Creation and removal:** with the entity or actor that owns the instance. Inside one tree, a
  task's data is created on `EnterState` and dropped on `ExitState`, which is Flow's trait lifetime.
- **Identity and late events:** the owning entity's handle; references into instance data die with
  the task's activation.
- **Timers:** per-instance fields ticked by the tree (StateTree's Delay task holds its remaining time
  in instance data) *(recall)*.

**Static structure.** The tree shape is static and shared; a population is "same tree × N entities".
Each instance has its **own** active states, which is why a per-entity StateTree is a separate
executor, the analogue of one actor per row.

**Atomic step.** Each instance ticks on its own; nothing makes a host and N instances change in one
step. Mass processes all instances of one asset in one processor pass, in chunk order.

**Cost and pitfalls.** The template/instance split is cheap and clean. Per-instance active states
break K4 if put inside one actor.

### 1.7 Zag.js and XState headless widgets

**Toasts: one machine per toast, created by the UI.** The toast group machine is set up once; the
`Toaster` maps over `api.getToasts()` and each `Toast` component calls
`useMachine(toast.machine, machineProps)` ([Zag toast](https://zagjs.com/components/react/toast)).
In the source, the group keeps `toasts` as an array whose identity is `toasts.map((t) => t.id)`, fed
from a store; each toast machine has states `visible`, `visible:persist` (paused), `dismissing` and
`unmounted`; the auto-dismiss is an effect of the `visible` state that arms a timeout for
`remainingTime`, and pausing subtracts the elapsed time from `remainingTime`
([toast.machine.ts](https://github.com/chakra-ui/zag/blob/main/packages/machines/toast/src/toast.machine.ts),
[toast-group.machine.ts](https://github.com/chakra-ui/zag/blob/main/packages/machines/toast/src/toast-group.machine.ts)).
A dismissed toast tells its parent `TOAST.REMOVE` with its id.

**Tags input: one machine, a list of strings, one focus slot.** `value` is an array of strings;
per-tag UI is addressed by `{ index, value }` ([Zag tags input](https://zagjs.com/components/react/tags-input)).
In the source, the machine keeps **one** `editedTagId`, `editedTagIndex` and `editedTagValue`, and one
`highlightedTagId`
([tags-input.machine.ts](https://github.com/chakra-ui/zag/blob/main/packages/machines/tags-input/src/tags-input.machine.ts)).
Editing a tag is a single slot in the host, not a mode per tag, because only one tag can be edited
at a time.

**XState** composes collections as spawned child actors held in context *(recall: `spawnChild` /
`spawn` in v5)*; each child has its own mailbox. This is the rejected "one actor per item".

**Lesson.** Zag uses two different shapes on purpose: **real per-copy behaviour (toast timers)
becomes a machine per copy; per-copy UI focus (editing) becomes one slot in the host**.

## 2. What the systems agree on

| Question | Elm | React | Solid / Svelte | RTK adapter | ECS | BT / StateTree | Zag / XState |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Who writes membership | owner's `update` | owner's data, via render | owner's data | owner's reducer | commands, at a sync point | owner of the entity | UI / store |
| Membership as an event on the collection | no | no | no | `addOne` etc. are reducers, not events | `spawn` / `despawn` commands | no | store methods |
| Public identity | author's id | key | key / reference / index | `selectId` | handle | entity | id |
| Private incarnation | none (manual counter) | fiber | owner | none | generation / version | instance data | actor |
| Per-copy timer | subscription (derived) or sleep (fenced by hand) | effect with cleanup | owner cleanup | none | timer as data | instance data | state effect per actor |
| Removal stops timers by construction | subscriptions yes; sleep no | yes | yes | n.a. | yes (data) | yes | yes (actor stopped) |
| Late result after re-add | reaches new row unless fenced | reaches new row unless `ignore` flag | same as React | same | fenced by generation | fenced by activation | old actor is gone |
| Behaviour written once | `Row.update` | component | component | n.a. | system | asset | machine |
| Analysed once for all copies | types only | no analysis | no analysis | types only | schedule graph | asset | per machine |

Three conclusions follow.

1. **No system needs an `Add` event or an `owner` flag.** Membership is the owner's data, written by
   the owner's own update. Policy ("only on the Invite page", "at most 5") is ordinary logic in the
   owner's update that writes the list. Where the UI may add (toasts), it calls the owner, and the
   owner decides.
2. **The incarnation is never API.** It is the fiber, the owner, the generation. Authors see a key,
   and the runtime guarantees that a new life behind the same key starts fresh and receives nothing
   meant for the old one. The two systems that do not do this (Elm, React for async) make authors
   write the fence by hand, and that is their best-known bug.
3. **Timers as a function of what exists** (subscriptions, effects with cleanup, data timers)
   satisfy R3 by construction. Flow's schedules already belong to an incarnation and are cancelled
   when it ends (v4 2.5 step 6), so Flow is in this group.

## 3. Mapping onto the cases

How each system would build C1–C6 in its own idiom, and what it costs.

| Case | Elm | React | ECS | StateTree | Zag |
| --- | --- | --- | --- | --- | --- |
| C1 invite rows, debounce per row | row record with value, error, debounce counter; `Process.sleep` fenced by counter | `<InviteRow key>` with `useEffect` timeout and `ignore` flag | entity with `Email`, `DebounceTimer` components; a check system | n.a. (too heavy) | one machine per row from the UI, or one host machine with per-row fields |
| C2 pin, flash per row | row `pinState`, `flashUntil`; `Time.every` subscription while any flash | row component with flash effect; optimistic state lifted to parent | `Flash { remaining }` component inserted by command, removed when zero | n.a. | per-row machine |
| C3 lockout per challenge | `Dict ChallengeId Lockout`; subscription per locked entry | state keyed by challenge in parent; component can't survive Back unless lifted | entity per challenge | instance per challenge, but a separate executor | per-challenge actor |
| C4 toasts | list with `remaining`, `hovered`; one `Time.every` while any visible | `<Toast key>` effect timeout | `Toast { remaining, hovered }`, one ticking system | n.a. | machine per toast (actual Zag design) |
| C5 inline editors | row `mode`, `draft`; debounce counter | row component with local `draft` state | `Editing` tag component | n.a. | one `editedTagId` slot if one at a time |
| C6 tags, line items | `List Item` and helpers | array in parent state | plain components, no system | n.a. | array of strings |

C3 shows a point the toolkits only meet implicitly: **state that must outlive its view** (strikes
across Back) cannot be component state in React or Solid; it is lifted to the owner, keyed by id. In
Flow terms, the collection must be placed on the node whose lifetime matches the data (v4 2.3), the
root for C3.

C4 and C5 show that **per-copy states are rarely needed**: Zag's toast states (`visible`,
`visible:persist`, `dismissing`) are a paused flag, a deadline and a dismissing flag; C5's mode is a
flag or, if only one row edits at a time, a single host slot. That is what K4 needs.

## 4. Against K1–K9

"Holds" means the system's approach, transplanted into Flow State, keeps the constraint.

| | Elm sub-models | React keyed children | Solid / Svelte | RTK adapter | ECS (systems over components) | StateTree per entity | Zag / XState actor per item |
| --- | --- | --- | --- | --- | --- | --- | --- |
| K1 one actor, one turn | holds (one `update`) | holds (one commit) | holds (one flush) | holds | holds at sync points; structural change lags a pass | breaks (instances tick alone) | breaks (mailbox per item) |
| K2 one static graph | holds for types; no graph | n.a. (no analysis) | n.a. | holds for types | **holds: systems analysed once for all entities** | holds per asset, not across host and instances | breaks |
| K3 no spawned actors | holds | holds (no actors) | holds | holds | holds (entities are data) | breaks if each instance is an executor | breaks |
| K4 one active leaf | holds (rows are data) | holds | holds | holds | holds (modes are tags / data) | breaks (states per instance) | breaks (states per toast) |
| K5 definition / machine split | partial (`Row.Model` vs `Row.update`) | n.a. | n.a. | holds (shape vs reducers) | holds (component types vs systems) | holds (asset vs instance data) | partial |
| K6 exact types | holds | holds with TS | holds | holds | holds | holds | weak (`any[]` in Zag group) |
| K7 determinism, persistence | ids are author data: holds; manual counters | keys are author data; fibers not persisted | same | holds | breaks unless sorted; ids not stable across runs | instance data not serialised by default | actors restored separately |
| K8 no I/O in the copy | holds (`Cmd` returned to owner) | breaks (effects fetch) | breaks | holds (thunks outside) | holds (systems are the host) | n.a. | breaks |
| K9 locality | holds (row module) | holds (row component) | holds | holds | weak (behaviour spread over systems) | holds | holds |

The ECS column is the only one that holds K2 *and* K4 *and* stays one step: **one description of the
behaviour, many rows of data, structural change at a defined point of the step**. React's column
gives the authoring model (R9) and the incarnation semantics (R4). The rest of this note combines
the two.

## 5. Candidate directions for Flow State

Each direction is sketched for C1 (invites) and C3 (challenges). Syntax follows v4 and is a draft.

### D1. Keyed placement from host data ("render the copies"), recommended

**Model.** React and ECS. The host keeps the ids as **its own plain memory**. The definition places a
trait **per id** (`.each()`), which is structure. The machine says **which ids**, as a function of
host memory, next to the trait's other fillings, which is behaviour. The turn **reconciles by id**:
an id that appears gets a fresh incarnation; an id that disappears ends its incarnation (schedules
cancelled, `onLeave` run); an id present before and after keeps its incarnation.

Reconciliation happens exactly where `resetOn` runs today (v4 2.5 step 3, on the source-updated
memory, before parts react), so it adds no new phase. A source transition that writes the ids and
raises into a new id in the same turn reaches the fresh incarnation, as a reset does. A part (a
callback filling) that writes the ids takes effect in the follow-up turn, as a pending reset does.
`ids` is, in effect, **`resetOn` generalised from one value to a set of keys**.

```ts
// signup.definition.ts
export const Signup = definition({
  id: "Signup",
  states: [{ WIZARD: ["PROFILE", "INVITE", "REVIEW"] }],
  events: { AddInvite: {}, RemoveInvite: { id: Schema.String }, Next: {}, Back: {} },
  memory: {
    inviteIds: Flow.initial(Schema.Array(Schema.String), []),   // plain host data: the membership
    nextInvite: Flow.private(Flow.initial(Schema.Int, 1)),       // deterministic ids (K7)
  },
  traits: {
    invites: Field(OptionalEmail).each(),                        // one Field per id (K5: structure)
  },
});

// signup.machine.ts
export const SignupMachine = machine(Signup, ({ S, E }) => ({
  traits: {
    invites: {
      ids: ({ memory }) => memory.inviteIds,                     // which copies exist, in order
      input: ({ id }) => ({ value: "" }),
    },
  },
  states: {
    WIZARD: {
      states: {
        INVITE: {
          on: {
            // Membership policy is ordinary host logic: no Add/Remove events, no owner, no canAdd.
            AddInvite: {
              target: "self",
              guard: ({ memory }) => memory.inviteIds.length < 5 || deny("TooManyInvites"),
              updateMemory: ({ memory }) => ({
                inviteIds: [...memory.inviteIds, `invite-${memory.nextInvite}`],
                nextInvite: memory.nextInvite + 1,
              }),
            },
            RemoveInvite: {
              target: "self",
              updateMemory: ({ memory, event }) => ({ inviteIds: memory.inviteIds.filter((i) => i !== event.id) }),
            },
            Next: {
              target: S.WIZARD.REVIEW,
              guard: ({ memory }) => memory.invites.every((f) => f.error === null) || deny("InvitesInvalid"),
              updateMemory: ({ memory }) => ({
                inviteIds: memory.invites.filter((f) => f.value !== "").map((f) => f.id),
              }),
            },
          },
        },
      },
    },
  },
}));
```

```tsx
// InvitePage.tsx
const invites = useView(signup, (s) => s.memory.invites);          // [{ id, value, error, touched }] in ids order
{invites.map((f) => (
  <div key={f.id}>
    <input value={f.value} onChange={(e) => signup.send(E.invites.id(f.id).Changed({ value: e.target.value }))} />
    <button onClick={() => signup.send(E.RemoveInvite({ id: f.id }))}>Remove</button>
  </div>
))}
<button disabled={!canAdd} onClick={() => signup.send(E.AddInvite())}>Add</button>
```

C3 under D1: a late `WrongCode` for a challenge that was removed writes the id back and strikes it in
one turn. Because the source's patch is reconciled before parts react, the raise reaches the fresh
incarnation; the old one's timer and memory are gone.

```ts
abandoned: [{
  guard: [({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn"), ({ payload }) => payload.tag === "WrongCode" || deny("NotWrong")],
  updateMemory: ({ memory, payload }) => ({ challengeIds: union(memory.challengeIds, [payload.input.challengeId]) }),
  raise: [E.challenges.id.from(({ payload }) => payload.input.challengeId).Strike],
}, {}],
// callbacks carry the id: onUnlocked: { target: "self", updateMemory: ({ memory, id }) => ({ challengeIds: without(memory.challengeIds, id) }) }
```

**Semantics to pin down (from React and ECS):**

- **Identity is the id; the incarnation is private.** Removing and re-adding an id in **one** turn is
  no change (React). Removing in one turn and adding in a later turn is a new incarnation, and every
  delivery armed or started under the old one is dropped with evidence (Bevy generation). The
  incarnation never appears in types, events or views; it appears only in Inspection and Stories
  (`invites["invite-2"]@1`).
- **To reset one copy**, change its id or give the trait a per-copy `resetOn` (React's "different
  key").
- **Order** of copies is the order of `ids`; raises into many copies run in that order (Unity's sort
  key, made the default).
- **Duplicate ids** in `ids` are a pre-commit defect (React warns; Flow refuses).
- **A view event to an absent id** is `Unhandled`, as today. **A host raise to an absent id** refuses
  the turn unless the same patch adds it.

**Meets.** R1 (count is data); R2 (one trait); R3 (fresh per incarnation, schedules cancelled with
it); R4 (private generation, as Bevy); R5 by construction (only the host writes host memory; policy
is its own guards); R6 (`s.memory.invites` ordered by ids); R7 (`E.invites.id(k)`; callbacks carry
`id`); R8 (C6 is just `Schema.Array` in memory, no `.each`); R9 (the UI reads like React). K1 (in the
turn, at the `resetOn` point); K2 (the trait is analysed once, marked "for each id", as an ECS system
is; `flow check` sees `ids` as a declared shape whose length is unknown); K3, K4 (copies are traits,
no states); K5 (`.each()` in the definition, `ids` in the machine); K6; K7 (ids are host data,
created deterministically by the host's own counter; generations are counts); K8; K9 (the
membership rule is written on the placement's filling).

**Costs.** One new placement method, one new filling (`ids`), one addressing form (`.id(k)`).
Generalising `resetOn` means part-written ids lag one snapshot, as `resetOn` does. Hosts must keep
ids unique and deterministic (no `crypto.randomUUID()` in a reducer, a lint).

### D2. Timers as copy data, one host schedule (no per-copy machinery)

**Model.** Elm subscriptions, Bevy `Timer` components, Zag's `remainingTime`. For copies whose only
behaviour is "expire at a time, pause while hovered" (C4, the C2 flash), each row stores a
deadline or remaining time as plain data, and **one host schedule fires at the earliest deadline**.
Removal removes the deadline by construction. It needs one schedule feature: a deadline computed from
memory.

```ts
// definition
memory: {
  toasts: Flow.initial(Schema.Array(Toast), []),   // Toast: { id, text, dueAt: Number | null, remaining: Number, hovered: Boolean }
},
internalEvents: { Expire: {} },

// machine
schedules: {
  expire: { at: ({ memory }) => earliest(memory.toasts.filter((t) => !t.hovered).map((t) => t.dueAt)), send: E.Expire },
},
on: {
  Expire: { target: "self", updateMemory: ({ memory, now }) => ({ toasts: memory.toasts.filter((t) => t.hovered || t.dueAt > now) }) },
  HoverToast: { target: "self", updateMemory: ({ memory, event, now }) => ({ toasts: pause(memory.toasts, event.id, now) }) },
},
```

```tsx
{toasts.map((t) => <div key={t.id} onMouseEnter={() => app.send(E.HoverToast({ id: t.id }))}>{t.text}</div>)}
```

**Meets.** R1, R3 (by construction), R4 (only by id; a firing is not addressed to a copy, so there is
nothing to fence), R5, R6, R8, R9; K1–K9, with K7 needing the clock read through the turn's `now`.
**Fails** R2: the toast logic is not a reusable trait unless wrapped as helpers. It is the Elm
guide's advice, "helpers over the model, not components", and should be the recommended pattern for
copies whose behaviour is only a deadline.

### D3. One focus slot instead of a mode per copy

**Model.** Zag's tags input keeps one `editedTagId`, not a mode per tag. C5 usually allows one
inline editor at a time; then it is a **single host trait reset by the edited id**, and needs no
collection at all. This is expressible in v4 today.

```ts
// definition
memory: { editingId: Flow.initial(Schema.NullOr(Schema.String), null) },
traits: { editor: InlineEditor({ autosave: "2 seconds" }) },   // draft, debounce, onSaved callback

// machine
traits: {
  editor: {
    resetOn: ({ memory }) => memory.editingId,                   // a new row's editor is fresh
    input: ({ memory }) => ({ draft: titleOf(memory, memory.editingId) }),
    callbacks: { onSaved: { target: "self", actions: [O.Issues.rename.commit(({ memory, payload }) => ({ id: memory.editingId, title: payload.draft }))] } },
  },
},
on: { Edit: { target: "self", updateMemory: ({ event }) => ({ editingId: event.id }) }, Close: { target: "self", updateMemory: () => ({ editingId: null }) } },
```

```tsx
{issues.map((i) => i.id === editingId
  ? <input key={i.id} value={editor.draft} onChange={(e) => app.send(E.editor.Changed({ value: e.target.value }))} />
  : <span key={i.id} onDoubleClick={() => app.send(E.Edit({ id: i.id }))}>{i.title}</span>)}
```

**Meets.** All K; R2, R3, R4 (via `resetOn`), R5, R9. Covers C5 only when one copy is active at a
time; several concurrent editors need D1. Its value is scoping: it shows C5 is not a forcing case for
collections unless concurrent editing is required.

### D4. Bounded slots (fixed copies, reused by id)

**Model.** Céu pools and ECS fixed-capacity arrays, Solid's `<Index>` (position fixed, data moves).
`Field(…).slots(5)` places five instances statically; each slot has an `id | null`. The graph is
literally five copies, so K2 holds trivially.

```ts
traits: { invites: Field(OptionalEmail).slots(5) },
// view: s.memory.invites.filter((slot) => slot.id !== null)
```

**Meets** K2 most literally and R1 up to the bound. **Fails** R9 (slot index leaks into the UI or
must be hidden behind an id map), and needs an incarnation per slot anyway (R4), so it is D1 with a
bound plus an extra concept. Recommended only as D1's `max` checked statically, not as a separate
model.

## 6. Recommendation

1. **Adopt D1** as the answer to rule 9: membership is host memory, copies are reconciled by id in
   the turn at the `resetOn` point, incarnations stay private. It removes `Add`, `Remove`, minted
   keys, `owner`, `canAdd` and `canRemove`, which were the parts problem.md names as hard to explain.
2. **Document D2 and D3 as the preferred patterns** where a copy's behaviour is only a deadline (C4,
   the C2 flash) or only one copy is active (C5 usually). That keeps C6 and these cases free of
   collection machinery (R8) and follows Elm's guidance and Zag's own split.
3. **Take from ECS** the three runtime rules D1 needs: structural change at one defined point of the
   turn; generation-checked delivery; deterministic order (the `ids` order) for raises into many
   copies.

## Sources

- Elm guide, *Structure*: <https://guide.elm-lang.org/webapps/structure>
- Elm `Html.Keyed`: <https://github.com/elm/html/blob/master/src/Html/Keyed.elm>
- Elm `Process`: <https://github.com/elm/core/blob/master/src/Process.elm>
- React, *Preserving and resetting state*: <https://react.dev/learn/preserving-and-resetting-state>
- React, *Synchronizing with effects*: <https://react.dev/learn/synchronizing-with-effects>
- React, *Reconciliation*: <https://legacy.reactjs.org/docs/reconciliation.html>
- Solid `<For>`: <https://docs.solidjs.com/reference/components/for>
- Solid `<Index>`: <https://docs.solidjs.com/reference/components/index-component>
- Svelte `{#each}`: <https://svelte.dev/docs/svelte/each>
- Redux Toolkit `createEntityAdapter`: <https://redux.js.org/toolkit/api/createEntityAdapter>
- Bevy `Commands`: <https://docs.rs/bevy/latest/bevy/ecs/prelude/struct.Commands.html>
- Bevy `Entity`: <https://docs.rs/bevy/latest/bevy/ecs/entity/struct.Entity.html>
- Bevy 0.13 release notes (automatic sync points): <https://bevy.org/news/bevy-0-13/>
- Unity Entities, command buffers: <https://docs.unity3d.com/Packages/com.unity.entities@1.3/manual/systems-entity-command-buffers.html>
- Unity Entities, ECB playback: <https://docs.unity3d.com/Packages/com.unity.entities@1.3/manual/systems-entity-command-buffer-playback.html>
- Unreal Mass Entity overview: <https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-entity-in-unreal-engine>
- Unreal `FStateTreeInstanceData`: <https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/StateTreeModule/FStateTreeInstanceData>
- Unreal `FStateTreeInstanceStorage`: <https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/StateTreeModule/FStateTreeInstanceStorage>
- Unreal `FMassStateTreeInstanceFragment`: <https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassAIBehavior/FMassStateTreeInstanceFragment>
- Unreal `UMassStateTreeSubsystem`: <https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassAIBehavior/UMassStateTreeSubsystem>
- Zag toast docs: <https://zagjs.com/components/react/toast>
- Zag tags input docs: <https://zagjs.com/components/react/tags-input>
- Zag sources: <https://github.com/chakra-ui/zag/tree/main/packages/machines/toast/src>,
  <https://github.com/chakra-ui/zag/blob/main/packages/machines/tags-input/src/tags-input.machine.ts>
