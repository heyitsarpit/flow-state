---
proposal spec-boundary-channels
status proposed 2026-11-20
---
# Actor boundary channels: emits out, props in

**Bottom line:** an actor gets two declared channels across its boundary, and neither adds a second writer anywhere.
An **emit** owns no core state at all: the turn computes it before commit and records it as one `Emitted` evidence
record right after the turn's `Published`; listeners, Stories and the trace all read that one record, so a listener
and a Story can never disagree. **Props** are one opaque value on a local actor's incarnation with one owner
(`src/core/props.ts`), changed only by `Mail.Props` in its FIFO place; every callback reads props through one
`readsOf` bag, so "props reach guards only" cannot be written. The six UI primitives are fixtures over these two.

Everything here is proposed. Serves @task.V3.T77, @task.V3.T76, @task.V3.T78, @task.V3.T72, @task.V3.T73. Asks are in
section 8. Paths are under `packages/flow-state-v3/` unless they start with `wiki/` or `codebases/`.

## 1. What exists

No part of either channel is built: `emit`, `onEmit`, `Emitted`, `props`, `onProps` and `setProps` have no hit in
`src/`, `fixtures/` or `tests/` (the hits are comments and one fixture's parameter name).

| File and symbol                                                                  | What it does today                                                            | Holds or changes                              |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `src/core/serve.ts` `turn()`, accepted branch (340-362)                          | commit, `Turned`, lanes, schedules, `publish`, context wave, sends            | holds; gains the emit records after `publish` |
| `src/core/incarnations.ts#publish` (64-70)                                       | the only `Act.Published`                                                      | holds; `Published` gains nothing              |
| `src/core/evidence.ts` (157)                                                     | `Published { actor, state, memory }`; no payload-carrying output              | gains `Emitted`                               |
| `src/core/tx.ts` (156, 502)                                                      | evidence is always collected, never elided                                    | holds; emits rest on it                       |
| `src/host/driver.ts` (336-362)                                                   | per step: admit hook, `world = out.world`, `options.sink(evidence)`, commands | holds; gains one emit consumer                |
| `src/host/driver.ts` (398-401)                                                   | an input made during a step queues in `inbox`                                 | holds; makes delivery non-re-entrant          |
| `src/host/runtime.ts#Actor` (110-116)                                            | `machine`, `send`, `getSnapshot`; no subscription                             | gains `onEmit`; local handles gain `setProps` |
| `src/host/runtime.ts` sinks (246, 285-291)                                       | a throwing sink is detached silently                                          | holds for inspectors; **wrong for listeners** |
| `src/host/runtime.ts#createActor` (517-533)                                      | `{ input }`, name `~n`, `Input.Create`                                        | gains `props`                                 |
| `src/core/world.ts#Mail` (432)                                                   | `Event`, `Firing`, `Context`, `Ending`                                        | gains `Props`                                 |
| `src/core/world.ts#Incarnation` (205-220)                                        | no props field                                                                | gains `props` (opaque) and `propsBaselines`   |
| `src/core/context.ts#react` (264), `#update` (345-377)                           | reactions, silent baselines, events to the mailbox front                      | holds; props copy the order, not the code     |
| `src/core/same.ts#sameValue`                                                     | structural equality, NaN equal to NaN                                         | holds; the props equality                     |
| `src/core/turn.ts` (432, 460, 481, 593), `schedules.ts` (87), `context.ts` (284) | each builds its own `{ memory, … }` literal                                   | **changes**: one `readsOf`                    |
| `fixtures/number-input/` (`Configure`, `settings`, `lastCommit`)                 | props mirrored into memory by an event                                        | T78 replaces it                               |
| `fixtures/command-palette/` (`Configure`)                                        | shared, persisted actor                                                       | keeps `Configure` (decisions R12)             |

What is wrong or missing, in order of weight:

1. **No outward channel.** The only per-turn output is `Published` (state and memory). A cause-dependent command is
   stored as a request plus a counter (`lastCommit.seq`), which replays after a reload (T71's review, 2026-11-15).
2. **No inward channel.** The number input mirrors seven props into memory through one handler, and every Story
   re-sends `Configure` after a reload (T71's review).
3. **Callback arguments are built at six or more sites.** Adding props there one by one is T76's false pass.
4. **A raw sink is the wrong listener.** It is detached on its first throw with no report (`runtime.ts:285-291`), and
   a refused `send` inside it throws (`runtime.ts:413-415`), so a focus handler would go deaf silently.
5. **A turn has no parts** (spec-fragments 1(1)): fragment emits need the walk and the `Address`; root emits do not.
6. The toaster, menu, combobox, tree and token input fixtures do not exist; only the number input does.
7. `Flow.keyed` is still in `src/flow.ts` although dropped (the user, 2026-11-20); the Declared-schedules Task's, not
   this concept's.

## 2. State inventory

### 2.1 State this concept owns

| State                                  | Where                              | Values                              | Inputs that change it in one step                       |
| -------------------------------------- | ---------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| a local actor's props                  | core, `Incarnation.props`          | a complete decoded record           | `Create`; a served `Mail.Props` (table 3.4)             |
| an `onProps` reaction's baseline       | core, `Incarnation.propsBaselines` | the last selection                  | `Create` (silent); a props turn (table 3.5)             |
| the listener set of one actor identity | host, `src/host/emits.ts`          | ordered listeners, each `Listening` | `onEmit`; its unsubscribe; Runtime disposal (table 3.3) |

Not state (derived or never stored): an emit (a value of the accepted turn, then an evidence record, then nothing);
whether an actor may take props (`Compiled.props` and how it was reached, table 3.6); a prop's default (the Schema's);
the snapshot's `props` row; the props queue (it is the actor's one mailbox; there is no second queue in the core).
PD1 would delete the baseline row as well.

### 2.2 Seams

| Neighbour             | Crosses                                                                                             | Direction            |
| --------------------- | --------------------------------------------------------------------------------------------------- | -------------------- |
| fragments (T109)      | `Address`, `Part`; I add `actor` to their `Emitted { address, instance, name, payload }`            | I read               |
| fragments (T109)      | every `Scope` carries the root's props: `Scope.props` is `readsOf(incarnation).props`               | I offer              |
| turn parts (new Task) | each accepted part returns `emits: ReadonlyArray<Emit>` in walk order; a refused part returns none  | I read               |
| typed machine (T113)  | `Parts<D>["Props"]`, `Parts<D>["Emits"]`; rows `props` and (types only) `emits` of `SnapshotFields` | I add                |
| saved records (T92)   | nothing: `bodyOf` has no props, baseline or emit partition (I7)                                     | none, by a type test |
| schedules (T57)       | a props turn is an occasion: `keys`, `paused`, `restartOn` are re-read after it (G1 widened)        | I call               |
| React (T30)           | `listen(actor, (emitted, turn) => void)` raw feed for `useOnEmit`'s per-render queue; `setProps`    | I offer              |
| testing (T29)         | `Story.machine` first slice, the `props(values)` step, the emits assertion                          | I build, T29 extends |
| inspection, CLI       | evidence and trace kind `emit`; `explain` and `graph` edges for emit parts and `onProps`            | I record, they print |

## 3. The design

### 3.1 Public API, from where the data comes

A parent component owns `qty` (React state) and `stock` (fetched). The pointer sends `Press`. The parent applies the
intent the stepper emits. Nothing below is new spelling; all of it is @plan.Machines.O1, O2 and O7, unbuilt.

```ts
// user-defined: Stepper, StepperMachine, IDLE, Press, by, value, max, Change, AtMax
// existing: definition, machine, guard, deny, createActor, send   // NEW: props, emits, emit, onEmit, setProps
import { Effect, Schema } from "effect"
import { definition, deny, machine } from "flow-state"

const Stepper = definition({
  id: "Ui/Stepper",
  states: ["IDLE"],
  events: { Press: { by: Schema.Number } },
  props: {                                                                          // NEW
    value: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
    max: Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(10))),
  },
  emits: { Change: { by: Schema.Number } },                                         // NEW
})

export const StepperMachine = machine(Stepper, ({ S, emits }) => ({
  default: S.IDLE,
  on: {
    Press: {
      guard: ({ event, props }) => props.value + event.by <= props.max || deny("AtMax"), // NEW: props in guards
      emit: [emits.Change.from(({ event }) => ({ by: event.by }))],                 // NEW: the intent (R7)
    },
  },
}))

// The owner (outside React; `useActor` and `useOnEmit` are @task.V3.T30's and call exactly these three).
let qty = 1
const stepper = runtime.createActor(StepperMachine, { input: {}, props: { value: qty, max: 3 } }) // NEW: props
const stop = stepper.onEmit({                                                       // NEW: onEmit
  Change: ({ by }) => { qty += by; stepper.setProps({ value: qty }) },              // NEW: setProps
})
stepper.send(StepperMachine.E.Press({ by: 1 }))   // one turn, one Emitted, one handler call, one props turn
```

A fragment's emit is heard under its slot name; an `.each` copy's handler receives its key (PD2 settles the shape):

```ts
editor.onEmit({ uploads: { Done: ({ ref }, { key }) => rows.get(key)?.focus() } }) // user-defined: uploads, Done
```

Added: definition `props` and `emits`; body `emits` tokens, the `emit` part, `props` in every reader, `onProps`;
`Actor.onEmit`; `LocalActor.setProps`; `createActor`'s `props`; Story `props(values)` and the emits assertion;
evidence `Emitted`. Dropped: nothing public (the number input's `Configure`, `settings`, `lastCommit` go in T78).

### 3.2 Emits: a value of the turn, then a record, then nothing

```ts
// NEW: src/core/emits.ts (pure)
export type Emit = { readonly address: Address; readonly instance: Option.Option<InstanceId>
                     readonly name: string; readonly payload: Values }
export const emitsOf: (alternative: Alternative, reads: Reads, event: Values) => Result.Result<ReadonlyArray<Emit>, Refusal>

// src/core/evidence.ts, NEW variant; the only constructor call is in serve.ts, right after publish(settled)
Emitted: { actor: Who; address: Address; name: string; payload: Values }

// src/core/compiled.ts
Compiled.emits: ReadonlyMap<string, EmitSpec>          // NEW: name → payload codec
Alternative.emit: ReadonlyArray<EmitPart>              // NEW: { name, from: Option<Slot<Mapper>>, payload: Option<Values> }
```

The order in `serve.ts`, accepted branch; only the two marked steps are new:

1. `runTurn` selects the alternative. **NEW:** `emitsOf` runs each `emit` part with the pre-turn reads (event,
   before memory, props, context) and checks each payload against its codec. A mapper throw or a refused payload
   refuses the turn before commit, exactly as a send's payload does (`turn.ts#sendOf`).
2. Commit, `Turned`, lanes, `schedules.turned`, `publish(settled)`: unchanged.
3. **NEW:** one `Act.Emitted` per emit, in written order (walk order once parts exist).
4. Context wave, then sends: unchanged.

Emits never enter `World`, mail or a record, and they do not count toward the loop guard (they make no mail). An
instance that ends in the same turn still emits: the `Emit` holds its `Address` by value, and the host looks
listeners up by slot names, never by a live instance.

**Delivery (host).** `runtime.ts` passes the driver one more consumer beside the inspector sinks. After
`world = out.world`, for each `Emitted` in the step's batch, in batch order, it calls the listeners of that actor
identity (table 3.3). A step can serve up to 100 mail items (`defaults.ts:39`), so a handler's `getSnapshot()` is
**at or after** the emit's turn, never before it; that is decisions R6's wording. A `send` or `setProps` made in a
handler queues in `inbox` and runs in a later step, so its emits arrive after every emit of the current batch.

```ts
// src/host/runtime.ts
export type Actor<D> = { /* machine, send, getSnapshot: unchanged */
  onEmit(handlers: EmitHandlers<D>): () => void }      // NEW: not a use; returns its unsubscribe
export type LocalActor<D> = Actor<D> & { setProps(patch: Partial<PropsGiven<D>>): void }   // NEW: createActor only
// NEW: src/host/emits.ts, the one owner of listener sets
export const makeListeners: () => { add, remove, deliver(batch: ReadonlyArray<Evidence>): void, listen }
```

### 3.3 Table: one actor's listener set (owner `src/host/emits.ts`)

| Input                                                   | While idle                                                                 | While delivering a batch                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `onEmit(handlers)`                                      | appended, `Listening`                                                      | appended; hears only emits of **later steps**                        |
| unsubscribe                                             | removed                                                                    | removed; hears nothing more of this batch (checked before each call) |
| unsubscribe twice                                       | no change                                                                  | no change                                                            |
| an `Emitted` for this actor, handler declared           | call it once per listener, in registration order                           | (the same)                                                           |
| an `Emitted`, no handler for the name or no listener    | dropped; the record stays in evidence                                      | (the same)                                                           |
| a handler throws (or a refused `send` throws inside it) | one `Reported` host report; the listener **stays**; the next listener runs | (the same)                                                           |
| the actor is disposed or ends                           | the set stays (a handle follows the identity); no emits arrive             | the batch finishes                                                   |
| Runtime disposal                                        | every set dropped                                                          | the batch stops with the driver (`driver.ts:281`)                    |
| restore, reload, hydration, server render               | no call: no `Emitted` exists for a turn that did not run                   | not reachable                                                        |

### 3.4 Table: `Incarnation.props` (owner `src/core/props.ts`)

`Props` is a branded record built only by `props.ts` (`propsAtCreate`, `propsAfter`); a spread or literal elsewhere
is a type error, the guard spec-fragments 3.6 uses for `Instances`.

| Input                                                   | Result                                                                       | Evidence                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------- |
| `Create` with `props` given                             | defaults overlaid with the decoded given fields                              | `Incarnated`, `Published`   |
| `Create` with none                                      | every Schema default                                                         | (the same)                  |
| `Mail.Props`, some field differs under `sameValue`      | merged; then table 3.5; then schedules re-read; one publish                  | `PropsChanged`, `Published` |
| `Mail.Props`, every field equal                         | nothing changes; no reaction, no publish                                     | none                        |
| `Mail.Props` for an ended or disposed actor             | dropped by the life verdict, as an `Event` is                                | as a late send              |
| a patch that fails a prop's Schema                      | refused at `setProps` with `InvalidProps`; no mail, no turn                  | none                        |
| any other mail (`Event`, `Firing`, `Ending`, `Context`) | never writes props                                                           | not applicable              |
| restore, hydration                                      | not reachable: a local actor is never saved; a machine with props has no ref | not applicable              |

The patch is decoded once in the host (`driver.send`'s place for events) and merged **when served**, not when
queued, so two queued patches `{ min }` then `{ max }` both land and a send between them reads exactly the first.
Patches are never coalesced: joining a later patch into an earlier one's place would show a send props from its
future. `useActor` compares before it calls `setProps` (@plan.React.O2), so renders do not flood the mailbox.

### 3.5 Table: `onProps` in a props turn (owner `src/core/props.ts`)

The Plan's shape is `{ select({ props, memory }), when?(now, before), event }` (@plan.Machines.O7). Rows run per
reaction, in declaration order, only in a props turn and at `Create`.

| Baseline        | Selection now                         | `when`         | Result                                                                             |
| --------------- | ------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| none (`Create`) | any                                   | not called     | baseline set from the **created** props, silent                                    |
| b               | equal to b (`sameValue`)              | not called     | nothing                                                                            |
| b               | differs                               | true or absent | baseline moves; the event is mapped and put at the **front** of the mailbox        |
| b               | differs                               | false          | baseline moves; no event                                                           |
| b               | `select`, `when` or the mapper throws | -              | baseline kept; one issue (source `OnProps`); no event; the next props turn retries |

Reaction events go to the mailbox front (`tx.enqueueFirst`, as `context.ts:375` does), in declaration order, so no
other mail of that actor is served between a props change and its repairs. A reaction event's handler is an ordinary
accepted transition: it may write memory and may emit. A props turn itself runs no handler, so it never emits.
`context.ts#react` is not reused as code (it reads slots and raises `IssueSource.OnContext`); the order above is
copied and one shared row test covers both.

### 3.6 Table: eligibility, who may take props

| Machine declares props | Reached by                                                                           | Result                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| yes                    | `createActor`, `Story.machine` (and `useActor`, T30)                                 | allowed; `setProps` on the handle                                                                      |
| yes                    | `actorRef(...)`, `ensureActor`, `useActorByRef`, a context provider, a `send` target | type error, and `InvalidConfiguration` (`PropsOnSharedActor`) at construction; `flow check` reports it |
| no                     | any                                                                                  | allowed; `props` is `{}`; a local handle's `setProps({})` is silent                                    |
| a trait or subroutine  | -                                                                                    | declares no props (decisions Q5c); its `Scope` reads the root's                                        |

Construction also refuses: a prop with no Schema default (`PropWithoutDefault`, read from the Schema's structure as
`TwoDefaults` is); a prop name colliding in the one namespace; an `emit` part naming an undeclared emit; an `emit`
key on entry, exit or a reaction (the types have no such key; the compiler refuses a cast). `UnusedEmit` is a warning.

### 3.7 One reader bag

```ts
// before: six or more literals (turn.ts:432, 460, 481, 593; schedules.ts:87; context.ts:284)
const select = { memory, event: input.payload }
// after: src/core/reads.ts (NEW); every site spreads the one bag
export const readsOf: (incarnation: Incarnation) => { memory: Values; props: Values; context: Values }
const select = { ...reads, event: input.payload }
```

Guards, `updateMemory`, payload mappers (`from`, emit, send), schedule functions, `keys`, `paused`, `restartOn`,
`when`, and `check(s, event)` (which builds the bag from the snapshot) all go through it. T76 lands this refactor
first with `props: {}`, so the feature is one line afterwards and fragments' `Scope` extends the same bag.

### 3.8 Stored versus derived

Stored: `Incarnation.props`, `Incarnation.propsBaselines` (core, never in a record); listener sets (host). Derived:
the snapshot's `props`; the issue of a failing reaction, if the issues owner derives it from a failing baseline
(the user's rule, 2026-11-20; the issues owner decides the carrier); `explain`'s emit and `onProps` edges (from
`Compiled`); a Story's emit list (from evidence). Never stored: an emit.

## 4. Requirements and Invariants

| Id  | Rule                                                                                                          | Source                       | Fails on a wrong build when                   |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| R1  | any accepted transition may emit: send, firing, ending, `onContext` event, `onProps` event                    | Machines O2                  | a firing's emit is missing                    |
| R2  | entry, exit, a props turn, a context update and a refused turn never emit                                     | Machines O2                  | a denied `Press` records `Emitted`            |
| R3  | the emit mapper reads the event, the **before** memory, props and context                                     | decisions Q3d, R3            | it reads the written memory                   |
| R4  | a mapper defect or a payload its codec refuses refuses the turn before commit                                 | decisions, Emits batch       | memory commits and no emit follows            |
| R5  | `Emitted` follows its turn's `Published`, in written order, before the turn's sends                           | T77 approach                 | it precedes `Published`                       |
| R6  | `onEmit` hears each emit once per listener, in order, with a snapshot at or after its turn; it is not a use   | decisions Q3e, R6            | a handler reads the pre-turn snapshot         |
| R7  | nothing replays: a restore, reload or hydration records no `Emitted` and calls no handler                     | decisions Q3a                | a reload re-focuses                           |
| R8  | a fragment's emit carries its `Address`; its handler sits under the slot name and gets the copy's key         | decisions Q3c; fragments R10 | a copy's emit has no key                      |
| R9  | a copy that ends in the turn still emits                                                                      | decisions, Emits batch       | `Done` is lost when the copy is removed       |
| R10 | every prop has its Schema default before any use; `createActor` overlays what it is given                     | decisions R2                 | the first snapshot lacks a prop               |
| R11 | a props update is its own turn in its FIFO place and changes only props                                       | Machines O3, O7              | a later send reads earlier, or memory changes |
| R12 | an equal patch is silent: no publish, no reaction, no evidence                                                | decisions Q5d, R8            | NaN, or an equal list, publishes              |
| R13 | `onProps` follows table 3.5; its events precede all other mail                                                | Machines O7                  | a send reads shrunk props, unrepaired memory  |
| R14 | every reader of memory receives props of the same snapshot                                                    | decisions R3; T76 false pass | `paused` reads no props                       |
| R15 | only local actors take props (table 3.6)                                                                      | decisions R1, R9, R10        | a ref on a props machine is admitted          |
| R16 | a props turn re-reads `keys`, `paused` and `restartOn`                                                        | decisions G1, R3             | `disabled` does not pause a hold              |
| R17 | names: props, emits, memory, states, traits, operations share one namespace                                   | Machines O1                  | a prop named as a memory field compiles       |
| I1  | every `Emitted` has a `Turned` and a `Published` of the same actor before it in the same batch                | 3.2                          | an emit stands alone                          |
| I2  | handler calls of one listener equal the `Emitted` records for its declared names since it was added, in order | 3.3                          | one is skipped or doubled                     |
| I3  | an emit of actor A never reaches a listener of B, including two copies of one machine                         | 3.3                          | local `~1` hears `~2`                         |
| I4  | a handler that throws detaches nothing and stops no other listener                                            | 3.3; code `runtime.ts:285`   | the second handler is not called              |
| I5  | `Incarnation.props` changes only in rows of table 3.4                                                         | epic, one owner              | an `Event` turn's output props differ         |
| I6  | `snapshot.props` holds every declared key, decoded, always                                                    | R10                          | a key is `undefined`                          |
| I7  | no record body, mail record or hydration payload has a props, baseline or emit field                          | decisions Q3a, Q5e           | a type test on `bodyOf` finds one             |
| I8  | between a props change and its last reaction event, no other mail of the actor is served                      | 3.5                          | a queued `Next` runs in between               |
| I9  | the baseline at `Create` is the selection over the created props, not the defaults                            | 3.5                          | `count: 3` at creation fires `Shrunk`         |

Tables: 3.3 rows are R6, R7, I2 to I4 by input and phase; 3.4 rows are R10 to R12, R15 and I5 by input; 3.5 rows
are R13 and I9 by baseline, selection and `when`; 3.6 rows are R15 and R17. Each row's test cites its rule.

## 5. Development strategy

Build order, each step resting on the one before:

1. **Spike A (30 minutes, scratch, before any production edit):** plant `Act.Emitted` after `publish` in a copy of
   `serve.ts` and a consumer in `runtime.ts`; run three probes: a handler that sends (order), 20,000 emits with one
   listener (cost), a handler that throws (I4). **Spike B:** `sameValue` and the Schema decode on a 100,000-item
   prop (T95's risk for `Configure` applies to an `items` prop). If either is over the bench budget, the host keeps
   the last given raw reference per field and skips an identical one; that is a measured cache, added only then.
2. T113 step 2 (`src/derive.ts`), so `Parts<D>` and `SnapshotFields` take the two rows.
3. **T77a, root emits:** `Compiled.emits`, the `emit` part, `emitsOf`, `Emitted`, `emits.ts` listeners, the Story
   assertion. It needs no parts walk and no `Address` beyond `[]`.
4. **T76:** `readsOf` first, then `props.ts`, `Mail.Props`, `setProps`, tables 3.4 to 3.6, `Story.machine`'s slice.
5. **T78:** the number input on both. 6. **T72 toaster** (shared, no props).
7. After the turn-parts Task and T109: **T77b, fragment emits** (addresses, nested handlers, the summary type), then
   **T72 menu** (its `nav` trait on OPEN needs T109) and **T73**.

Risk, highest first: the reader-bag refactor touching reviewed turn and schedule code (land it alone, behaviour
unchanged, every existing test green); the publication between a props turn and its repair turn (PD4); the
100,000-item prop; `Story.machine` not existing (section 7, T76).

Task split by state ownership (proposed): **T77 splits** into T77a (owns the `Emitted` record and the listener
sets; blocked by T113 only) and T77b (adds producers with a non-root address; blocked by T109). **T72 splits** into
toaster (after T77a) and menu (after T109). T76 keeps one owner, `props.ts`. T78 and T73 own only fixtures. This puts
T77a at step 6.5 of the cohesion file's build order (after TM's `derive.ts`), ahead of the turn-parts Task.

## 6. Testing strategy

Expected results come from the tables, never from running the code.

- **Row tests:** one test per row of 3.3 to 3.6, named by its rule. Table 3.2's matrix: trigger (send, firing,
  ending, `onContext` event, `onProps` event) by outcome (accepted, denied, unhandled, mapper defect, bad payload)
  by listeners (0, 1, 2): 75 rows, each asserting the exact `Emitted` list **and** the exact handler calls.
- **Sequence generator:** 2 to 4 local actors of one machine plus one shared actor; steps drawn from `send`,
  `setProps` (changed, equal, partial, NaN, a new array with equal content), clock advance, `onEmit`, unsubscribe,
  dispose; listeners that send, call `setProps`, unsubscribe themselves or another, and throw. The oracle is a
  ledger: per actor, the mailbox order gives the expected turns, each accepted turn's declared emits give the
  expected records, and each listener's window gives its expected calls (I2, I3, I8).
- **Dimensions earlier reviews missed:** several copies (I3; T77b: two `.each` copies with one name); non-default
  starts (I9; props given at `Create`; an out-of-range `value`); sequences over time (hold-repeat: three `Press`
  turns before one `setProps`, R7; a props patch queued behind a firing); restore after a definition edit (a shared,
  persisted machine with emits is reloaded under a definition that renamed an emit: no `Emitted`, no handler call,
  no decode error, I7); hostile fakes (a props object mutated after `setProps`, a getter-backed object, `-0`, NaN,
  a handler that disposes its actor).
- **Planted faults:** `emit-on-denied`, `emit-on-entry`, `emit-before-publish`, `emit-mapper-reads-after-memory`,
  `emit-replayed-on-restore`, `emit-in-record`, `emit-cross-actor`, `emit-order-reversed`, `emit-lost-when-copy-ends`,
  `listener-detached-on-throw`, `listener-added-hears-current-batch`, `props-coalesced`, `props-merged-at-enqueue`,
  `props-equal-publishes`, `props-turn-writes-memory`, `props-baseline-from-defaults`, `props-reaction-behind-mail`,
  `props-in-record`, `props-on-ref-admitted`, and one `props-missing-in:<reader>` per reader of 3.7.
- **Guards:** `Props` is opaque (type test: a spread outside `props.ts` fails); `Act.Emitted` has one call site and
  `readsOf` one definition (a lint rule over `src/core`, with a planted second site as its own fault); a type test
  that `bodyOf`'s keys exclude `props`, `propsBaselines` and `emits`.
- **False-pass guards from the Tasks:** every emit Story also runs with no listener and asserts the records (T77);
  every reader has a Story that reads a prop there (T76); T78 lists each T71 case as kept, moved or dropped; each
  ported upstream case cites its `codebases/ui-sdk/packages/core/test/` file and asserts no less (T72, T73).
- **Bench:** a turn with one emit and no listener against the same turn without; 20,000 emits, one listener; a props
  turn with 7 small props and one reaction; a props turn with a 100,000-item list; menu open with 30 hovers and a
  drag of 5 milestones (decisions Q4c).

Fixture leads from upstream (behaviour to port, re-read each cited test before use; section 9, sidecar 2):

| Fixture            | Actor           | Props                                                             | Emits                                           | Hard cases                                                                                                        |
| ------------------ | --------------- | ----------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| number input (T78) | local           | `value`, `min`, `max`, `step`, `disabled`, `readOnly`             | `Change` (intent), `Commit`                     | hold outruns the parent; `disabled` mid-hold; step from null with `min`; a typed commit is not deduped            |
| toaster (T72)      | shared          | none (`maxVisible` is context)                                    | `Dismissed { id, reason }`, `Focus`             | update after close never reopens; pause reasons clear separately; a promise toast dismissed while loading         |
| menu (T72)         | local or shared | none needed                                                       | `Focus { target }`, `OpenChange { reason }`     | refused `submenu-switch`; disabled trigger under a rest delay; pending action keeps it open                       |
| combobox (T73)     | local           | `items`, `value`, `query`, `open`, `autoHighlight`, `maxSelected` | `Change`, `OpenChange`, `Highlight`, `LoadMore` | items arrive while open; the highlighted item is removed; `LoadMore` once per page                                |
| tree (T73)         | local           | `items`, `expanded`, `activation`                                 | `ExpandedChange`, `Focus { id }`                | controlled `expanded`: focus only after the prop returns (an `onProps` event that emits); re-expand aborts a load |
| token input (T73)  | local           | `value`, `readOnly`, `disabled`                                   | `Change`, `Submit`                              | the parent replaces `value` while a token loads (a props patch against an ending, FIFO)                           |

## 7. Handoff for the Opus leads

**T77a (root emits).** Read first: 3.2, 3.3, `wiki/conventions/view-commands.md`, `src/core/serve.ts` 325-362,
`src/host/driver.ts` 336-362, `src/host/runtime.ts` 246-291. Decided: emits own no core state; one `Emitted` record
after `Published`; listeners are not sinks; a throwing handler stays. Open before code: the Story assertion's shape
(PD3); whether `story.ts` already reads evidence between steps (not verified here); the `turn` value `listen` hands
T30. First commit: Spike A's three probes as tests, table 3.3's rows and the 75-row matrix, failing; fixtures
`sign-in` and `command-palette` scenarios red.

**T76 (props).** Read first: 3.4 to 3.7, decisions section 9.1, `src/core/context.ts` 264-377, `src/core/same.ts`.
Decided: `Props` is opaque with one owner; merge when served; no coalescing; reaction events at the front;
`readsOf`. Open before code: PD1 (the reaction's shape); PD4; where `check(s, event)` gets its memory (find it, then
route it through `readsOf`); the failing-reaction issue's carrier, with the issues owner. First commit: the
`readsOf` refactor with `props: {}` and every existing test green; then tables 3.4 to 3.6 and the per-reader
Stories, failing.

**T78.** Read first: T71's two review comments (`wiki/tasks/V3/P2.task` 1117-1150), `fixtures/number-input/`,
`wiki/conventions/controlled-values.md`. Decided: no `Configure`, `settings` or `lastCommit`. Open: `Change`'s
payload for a typed commit, which is an absolute intent (recommended: `Change { by }` for steps and
`Commit { value }` for a typed commit, since only steps repeat). First commit: the T71 case map with each row's new
assertion, failing.

**T72.** Toaster after T77a; menu after T109 (PD5). Read first: decisions R1, R13, Q4a. Open: `onSelect`'s
"prevent close" is a decision the app returns, not an emit; settle its route (an operation's ending is the
recommended one) before the menu's Stories.

**T73.** After T76, T77b and T21's pieces. Decided: all three are local, config is props, view commands are emits,
no `Configure`. Open: the three probable upstream bugs its proposal names; pin the correct behaviour in a Story.

**T77b (fragment emits).** Read first: spec-fragments 2.2, 3.5 and R10. Takes `Address` and the parts walk's
`emits`. Decided by PD2 if accepted. First commit: R8, R9 and I3 over two copies, failing.

## 8. Proposed decisions

Each has two traces. PD1 to PD3 are public shape (the user's); PD4 to PD7 are implementation calls the orchestrator
may take.

**PD1. `onProps` takes the context-slot form: `P.count.change({ when?, event })`** [open: 2026-11-21; recommend as proposed] (recommended), replacing
`{ select, when, event }`. Why: decisions Q5 says "shaped like `onContext`", and `onContext` has since become
`C.slot.change`; with one prop per reaction the baseline is the prop's previous value, which the props turn already
holds, so `Incarnation.propsBaselines`, table 3.5's first row and I9 disappear.
Trace 1 (carousel, `count` 5 to 3): today's form stores baseline 5, selects 3, calls `when(3, 5)`, moves the
baseline; the token form reads `before.props.count` 5 and `after.props.count` 3, calls `when(3, 5)`, stores nothing.
Trace 2 (a `select` that reads memory, `({ props, memory }) => props.count - memory.index`): memory changes in a
`Next` turn, no reaction runs, and the next unrelated props patch fires a stale difference; the token form cannot
express that selection, and `when(now, before, { props, memory })` reads memory at the turn instead.

**PD2. A fragment emit's handler is `(payload, { key, keys })`:** [open: 2026-11-21; recommend as proposed] `key` is the innermost copy's key, `keys` every
key along the address, outermost first; a root or plain-trait handler receives `{}`.
Trace 1: `uploads: { Done: (p, { key }) => … }` with address `[{ slot: "uploads", key: "r1" }]` gets `key: "r1"`.
Trace 2: `boards: { cards: { Focus: (_, { key, keys }) => … } }` at `[boards b1, cards c7]` gets `key: "c7"`,
`keys: ["b1", "c7"]`; with `key` alone, two boards' cards `c7` are indistinguishable.

**PD3. A Story asserts emits exactly:** [open: 2026-11-21; recommend as proposed] an `emits([...])` step compares the whole ordered list since the previous
step; a Story with emits and no such step fails coverage.
Trace 1: Escape then OutsideClick; `emits([Focus({ target: "trigger" })])` after both passes; a build that also
emits on OutsideClick fails. Trace 2: with a "contains" assertion the same wrong build passes.

**PD4. A props turn and its reaction events publish separately, and the host notifies once per driver step.** [open: 2026-11-21; recommend as proposed]
Trace 1 (carousel shrink): the props turn publishes `{ count: 3, index: 5 }`, the front-queued `Shrunk` turn
publishes `{ count: 3, index: 2 }`; both are in one step, so a store subscriber sees only the second. Trace 2: the
step's 100-item yield (`defaults.ts:39`) falls between them; a subscriber sees `index: 5` once. If that must never
show, the alternative is to run reaction events inside the props turn's step unconditionally; the lead measures
which the driver already guarantees before choosing.

**PD5. Split T77 (root, fragment) and T72 (toaster, menu)** [open: 2026-11-21; recommend as proposed] as in section 5.
Trace 1 (split): T77a, T76, T78 and the toaster start after `derive.ts`. Trace 2 (no split): all five Tasks wait
for the turn-parts Task and T109, though none of the number input's or toaster's rules reads an `Address`.

**PD6. A handler that throws is reported and stays** [open: 2026-11-21; recommend as proposed] (table 3.3), unlike an inspector sink.
Trace 1: a focus handler throws once on a missing element; it is reported, and the next Escape focuses. Trace 2
(detach, today's sink rule): the first throw removes it and every later Escape does nothing, with no report.

**PD7. An explicit `undefined` in `setProps` returns that prop to its default; an absent key keeps its value.** [open: 2026-11-21; recommend as proposed]
Trace 1: `setProps({ max: undefined })` after `max: 3` gives the default 10. Trace 2: `setProps({ value: 2 })`
leaves `max: 3`. `useActor` passes every key each render, so an omitted prop returns to its default there
(@plan.React.O2) without a second rule.

**The riskiest open question** is PD4: whether a view can render the snapshot between a props change and its repair.

## 9. Sidecar log

Four Haiku sidecars, effort high, read-only.

1. **Code paths.** Accepted after my own read of `serve.ts` 340-362 and 425-460, `runtime.ts` 105-135 and 510-535,
   `driver.ts` 336-362, `world.ts` 205-220, `evidence.ts` 150-162: nothing of either channel is built; the accepted
   turn's order; `Actor`'s shape; `createActor`; the four `Mail` variants. Accepted unverified, marked as leads: the
   fixture and test line numbers. Rejected: nothing. Noted for a neighbour: `Flow.keyed` still in `src/flow.ts`.
2. **ui-sdk survey.** Changed: used only as the fixture leads table in section 6, because I did not re-read the
   cited upstream tests; each lead re-reads them. Its shared-contract finding (a controlled key fires its callback
   and waits for the owner) is accepted as agreeing with decisions R7.
3. **Records and decisions.** Accepted after re-reading T76, T77, the decisions file sections 2, 4 and 9, the
   cohesion file and spec-fragments 2.3 and 7: the acceptance items, R1 to R12, the missing build-order slot for T76
   and T77, `Emitted` having no type sketch. Accepted: the record differences (a) to (d), resolved here by taking
   the later rule (R1, R2, R3) and by "merge when served, no coalescing". Changed: its (g), "eligibility", is read
   here as who may take props (table 3.6). Rejected: nothing.
4. **Adversary.** Accepted and folded in: evidence is always collected; a step holds up to 100 mail items, hence
   "at or after"; a raw sink detaches on a throw, hence listeners are not sinks and PD6; `react` is context-specific
   and `Selected` has no failing variant, hence 3.5 copies the order and not the code; callback arguments are built
   by many literals, hence 3.7; `sameValue` is structural with NaN equal. Not verified by it or by me, left open in
   section 7: exactly one `Published` per accepted turn on every branch; `sameValue`'s cost on large lists; the
   Story steps that read evidence; a local actor's disposal path.
