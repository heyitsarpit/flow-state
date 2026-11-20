---
proposal spec-fragments
status proposed 2026-11-20
---
# Fragments: one table decides every fragment instance

A fragment instance gets no lifecycle writers of its own. Whether it exists is derived from three facts the turn
already commits (the active chain's activations, the host's `.each` list, the `resetOn` value), and one function,
`settle`, compares the stored instances with the wanted ones and returns every start, end, freeze and thaw as data.
Placement, release, abandon, resume, a copy appearing and a copy leaving are rows of that one table, not six writers.
A subroutine stores nothing: its states compile into the host's tree, so its incarnation is its state's activation.

Everything here is proposed. Serves @task.V3.T109 and @task.V3.T110; it is the addressing seam for @task.V3.T77
and @task.V3.T76 and feeds @task.V3.T72, @task.V3.T48 and @task.V3.T106.

## 1. What exists

Production has no fragment feature. `trait`, `subroutine`, `.each`, `resumable`, `whenAbandoned`, `raise` (as a
transition part) and `notify` have no hit in `packages/flow-state-v3/src/`, `fixtures/` or `tests/`.

| File and symbol                                                | What it does today                                               | Holds or changes            |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| `world.ts#Incarnation`                                         | one flat record per actor: state, activations, memory, schedules | gains `instances`           |
| `world.ts#OwnedBy`                                             | `Root` or `State { activation }` owns a lane's work              | holds; gains `Instance`     |
| `tree.ts#moveOf`, `#chainOf`, `#historyAfter`                  | one move's exits and entries; activations                        | unchanged (3.2)             |
| `tx.ts#mintIncarnation`, `#putIncarnation`, `#dropIncarnation` | the only mint, set and delete                                    | mints instances             |
| `incarnations.ts#makeIncarnations`                             | `start`, `ensure`, `release`, `end`, `dispose`, `boot`           | calls `settle`              |
| `disposal.ts#makeDisposal`                                     | Runtime disposal within its bound                                | ends instances by the table |
| `compiled.ts#Compiled`, `#Node`                                | one machine: `states` by path, `root`, `fields`                  | gains `slots`, `fragments`  |
| `turn.ts#runTurn`                                              | one event, one alternative, one move                             | **missing: parts**          |
| `schedules.ts`, `world.ts#Tracked`, `#trackOf`                 | timers per incarnation, by track                                 | called per scope (2.3)      |

Wrong or missing, in order of weight:

1. **A turn has no parts.** @plan.Machines.O3 walks raises, notifies and exits depth first into one turn; `runTurn`
   selects one alternative. Every fragment feature except plain placement needs the walk. No Task names it.
2. **No instance address.** The only identities are `ActorId` and `IncarnationId`; emits, timers, lanes and the
   snapshot have nothing to name `uploads` copy `r1` with.
3. **Stale-owner checks are written three times** (`firings.ts:82` by incarnation id, `serve.ts:395-398` by
   activation membership, `step.ts:112` by grace id). Instances would add a fourth; they get one check instead.
4. **Incarnation writers spread a snapshot** (`{ ...incarnation, grace }` in `incarnations.ts`, `raised` in
   `serve.ts`). A second field with several writers on that record invites the class T57 closed for timers.
5. The prototype (`prototypes/round-14/inc.ts`) keeps a nested `Inc` tree where each fragment has its own `leaf`,
   `activations` and `history`, and stores `item` beside the host's list. It proves the rules; its shape is not
   carried over (3.1 and 3.2 say why).

## 2. State inventory

### 2.1 State this concept owns

| State                              | Values                           | Inputs that change it in one step                                |
| ---------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| an instance's existence and status | absent, `Live`, `Frozen`         | every row of table 3.3                                           |
| an instance's identity             | `InstanceId`, minted             | a `Start` row only; never rewritten                              |
| an instance's `reset` value        | none, or the encoded reset value | a `Start` row only                                               |
| an instance's memory slice         | decoded `Values`                 | its own handlers' `updateMemory`; `Start` seeds it               |
| a frozen instance's parked endings | list of mail                     | an ending for a `Frozen` instance; `Thaw` drains; `End` drops    |
| pending settle                     | flag per incarnation             | commit sets it when committed facts differ from the settled plan |

Not state of this concept (derived, never stored): whether a subroutine is active (its state's activation); a copy's
`item` (the host list's entry with its key); the snapshot's slices and keyed lists; the subject path; key order.

### 2.2 The address

```ts
// NEW (proposed): src/core/instances.ts
export type Part = { readonly slot: string; readonly key: Option.Option<string> } // key only at an `.each` slot
export type Address = ReadonlyArray<Part>          // [] is the actor's root scope
export type InstanceId = string & Brand.Brand<"flow-state/InstanceId">
export const addressKey: (address: Address) => string // built once, never parsed; escapes like `actorKey`
export const subjectOf: (instance: Instance, hosts: ReadonlyArray<Instance>) => ReadonlyArray<string>
```

A slot is static (`uploads`, `CHALLENGE.confirm`); an `Address` is a slot path with a key at each `.each` slot.
Nested `.each` composes by position: `[{ slot: "boards", key: "b1" }, { slot: "cards", key: "c7" }]`. The subject
path is the reset values and keys along the address, outermost first (WriteLanes R16); it is derived.

### 2.3 Seams

| Neighbour             | Crosses                                                                              | Direction   |
| --------------------- | ------------------------------------------------------------------------------------ | ----------- |
| typed machine (T113)  | `Compiled.slots`, `Compiled.fragments`, a scope on every handler and schedule        | I read      |
| typed machine (T113)  | `InstanceTree<Def>`: slot names, `.each` key type, fragment emits and memory         | they derive |
| turn (no owner yet)   | `Scope` (`{ memory, props, key?, item? }`); the `Settled` plan applied at commit     | I offer     |
| schedules (T57, done) | occasions `Entered`, `Left`, `Frozen`, `Thawed`; `Mail.Firing` gains `instance`      | I call      |
| reads and operations  | `OwnedBy.Instance { id }`, `subjectOf`, `Ended { id, subject, cause, releases }`     | I notify    |
| saved records         | `Incarnation.instances` out; decoded instances in, ids dropped (Restore R1)          | both ways   |
| emits (T77)           | `Emitted { address, instance, name, payload }`; listeners keyed by slot name         | I address   |
| props (T76)           | nothing of their own: props stay on the root; every `Scope` carries the root's props | they own    |
| data layer            | none                                                                                 | none        |
| lazy features (T48)   | a slot whose fragment is not adopted is not wanted; adoption is a settle occasion    | open (7)    |

## 3. The design

### 3.1 Stored versus derived

```ts
// before: src/core/world.ts
export type Incarnation = { /* id, started, actor, state, activations, history, memory, schedules, … */ }

// after (NEW fields and types marked)
export type Status = Data.TaggedEnum<{
  Live: { readonly scope: Option.Option<ActivationId> }   // the activation that bounds it; none at the root
  Frozen: { readonly parked: ReadonlyArray<Mail> }        // endings that arrived while frozen
}>
export type Instance = {                                  // NEW
  readonly id: InstanceId
  readonly address: Address
  readonly fragment: string                               // Compiled.fragments key
  readonly reset: Option.Option<string>
  readonly status: Status
  readonly memory: Values
  readonly schedules: ReadonlyMap<string, Tracked>        // written only by the schedules owner
}
export type Incarnation = {
  // … every field of today, unchanged
  readonly instances: Instances                           // NEW: opaque, by addressKey, in start order
  readonly unsettled: boolean                             // NEW: a settle is owed before the next event
}
```

`Instances` is a branded map with no public constructor outside `src/core/instances.ts`; that type is the guard
(3.6). It is flat, keyed by `addressKey`, not the prototype's nested `kids`: a firing, an ending or an emit finds its
instance in one lookup, and a subtree is the addresses a prefix covers. The root keeps its fields on `Incarnation`;
`scopeOf(incarnation, address)` returns `{ memory, schedules }` for the root or an instance, so readers have one path
without rewriting a reviewed record. `item` is not stored: it is the host list's entry with the copy's key.

### 3.2 Subroutines store nothing

A subroutine's states compile into the host's `Compiled.states` under its placement state (`WIZARD.CANCELLING.ASKING`),
each `Node` carrying its scope. Then the code that exists already gives every subroutine rule:

| Rule (@plan.Machines.O2)                   | Given by                                             |
| ------------------------------------------ | ---------------------------------------------------- |
| entered at its default, or is a leaf       | `Node.default`, `leafOf`                             |
| abandoned by a transition that exits it    | `moveOf`'s exits                                     |
| an ancestor's `"self"` does not abandon it | `moveOf` exits nothing above the handler's boundary  |
| host events fall through to ancestors      | `runTurn`'s walk up `chainOf`                        |
| a new entry is a new incarnation           | the placement state's new `ActivationId`             |
| history restores control only              | `historyAfter`; the slice is seeded fresh by `Start` |

An exit is a compiled `Target` the host's filling supplies; "the filling leaves the subroutine's state" and "every
exit is filled" are construction checks, and an exit no state takes is the `flow check` finding T109 asks for. The
subroutine's memory slice, child traits and schedules are an ordinary instance at slot `<state path>`, wanted while
that state is on the chain, with `scope` its activation. The prototype's per-fragment `leaf`, `activations` and
`history` are dropped: "exactly one leaf is active" stays one fact.

### 3.3 The one table: stored status against wanted

**Owner: `settle` in `src/core/instances.ts`.** It is pure: `(compiled, incarnation, facts, occasion) => Settled`.
`Settled` is an ordered list of steps plus the next `Instances`. Nothing else adds, removes or re-statuses an instance.

Wanted is derived top-down, outermost slot first, hosts before their children:

| Slot                 | Wanted while                                                | Anchor (a change means another incarnation)       |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| root trait           | the actor's incarnation is live and `resetOn` is present    | host id, reset                                    |
| node trait           | its node is on the chain and `resetOn` is present           | host id, node activation, reset                   |
| `.resumable()` trait | as its placement                                            | host id, reset (the activation is not part of it) |
| subroutine slice     | its state is on the chain                                   | host id, state activation                         |
| `.each` copy         | its host is live and its key is in the host's repaired list | host id, key, and the slot's own anchor           |

`facts` are: the chain and activations after the turn's move; each live host's after memory; the reset values as last
read. A normal turn keeps reset values and reads lists and chain; the follow-up reset turn re-reads reset values.

| Stored | Wanted | Step | Result and effects |
| ------ | ------ | ---- | ------------------ |
| absent | no     | none |                    |
| Slot | Wanted while | Anchor (a change is another incarnation) |
| `Live(a)` | `a` | `Keep` | unchanged; recurse |
| `Live(a)` | `b ≠ a` | `End(Reset)`, `Start` | one turn; the old one's `whenAbandoned` runs |
| `Live` | no, own exit taken this turn | `End(Exit)` | removed; no `whenAbandoned` |
| `.resumable()` trait | as its placement | host id, reset (not the activation) |
| `Live` | no, any other cause | `End(cause)` | removed with its subtree, deepest first; `whenAbandoned` runs |
| `.each` copy | its host is live and its key is in the repaired list | host id, key, the slot's anchor |
| `Frozen(r)` | yes, reset differs | `End(Reset)`, `Start` | `whenAbandoned` runs for the frozen one |
| `Frozen` | no, host still live, anchor unchanged | `Keep` | stays frozen |
| `Frozen` | no, host ended, key gone or reset absent | `End(cause)` | `whenAbandoned` runs |

Causes: `Exit`, `Left` (its scope's activation left), `KeyGone`, `Reset`, `HostEnded`, `ActorEnded`, `Dropped`.

| Occasion  | Who calls                                   | Differences                    |
| --------- | ------------------------------------------- | ------------------------------ |
| `Started` | `incarnations.ts#start` (create and return) | only `Start` rows can apply    |
| `Turn`    | the turn, once, after the walk              | all rows                       |
| `Reset`   | the follow-up turn when `unsettled`         | all rows; reset values re-read |
| absent | anchor `a` | `Start` | `Live`; mint id; seed memory from the input filling; `Entered`; recurse |
| `Ended` | `end`, `dispose`, `disposal.ts` | wanted is empty; cause `ActorEnded` (PD3) |

`whenAbandoned` is not a writer. It is the parts `settle` appends for each `End` whose cause is not `Exit` or
`Dropped`, deepest first, `.each` copies in key order, read against the before memory. If the committed facts then
differ from what was settled (a `whenAbandoned` callback changed a list, or a `resetOn` value changed), commit sets
`unsettled` and the next admission runs the `Reset` occasion first (PD4). `settle` never loops inside a turn.

### 3.4 The fan-out raise (T110) is a decision table, not state

A raise whose target slot is `.each` resolves against the copies stored at turn start, in key order (PD2):

| Copy at turn start                  | Handler on its path | Guards                  | Result                                           |
| ----------------------------------- | ------------------- | ----------------------- | ------------------------------------------------ |
| none live                           |                     |                         | the raise is recorded and does nothing           |
| `Live`                              | none                |                         | skipped; `Unhandled` evidence naming the address |
| `Live`                              | yes                 | one alternative accepts | its part joins the turn                          |
| `Live`                              | yes                 | all decline             | the whole turn is refused                        |
| `Frozen`                            |                     |                         | not reached                                      |
| started by this turn                |                     |                         | not reached                                      |
| `Live`, its key leaves in this turn | yes                 | accepts                 | part runs, emits deliver, then `End(KeyGone)`    |

`FanOutNeverHandled` is static: no state of the fragment handles the event. Per-copy fan-out of write members stays
deferred (open-items 7 and 26).

### 3.5 Public API, from where the data comes

The API is @plan.Machines.O1's; nothing below is new spelling, all of it is unbuilt. A `File` is picked in the view;
the view mints a ref and sends `Attach`; the host's list is the only source of copies.

```ts
// user-defined: Upload, Editor, EditorMachine, Attach, Remove, CancelAll, Done, ref, attachments, uploads, onGone
// existing in the Plan, unbuilt: trait, .each, Flow.input, Flow.initial, Flow.Callback, raise, notify, emit,
//   whenAbandoned
import { Schema } from "effect"
import { definition, Flow, machine, trait } from "flow-state"

const Upload = trait(
  {
    id: "Upload",
    events: { Cancel: {} },
    callbacks: { onGone: Flow.Callback({ ref: Schema.String }) },
    emits: { Done: { ref: Schema.String } },
    memory: { ref: Flow.input(Schema.String), cancelled: Flow.initial(Schema.Boolean, false) },
  },
  ({ callbacks, emits }) => ({
    on: {
      Cancel: {
        updateMemory: () => ({ cancelled: true }),
        emit: [emits.Done.from(({ memory }) => ({ ref: memory.ref }))],
      },
    },
    whenAbandoned: [callbacks.onGone.from(({ memory }) => ({ ref: memory.ref }))], // the copy left the list
  }),
)

const Editor = definition({
  id: "Desk/Editor",
  states: ["EDITING"],
  events: { Attach: { ref: Schema.String }, Remove: { ref: Schema.String }, CancelAll: {} },
  memory: {
    attachments: Flow.initial(Schema.Array(Schema.Struct({ ref: Schema.String })), []),
    gone: Flow.initial(Schema.Array(Schema.String), []),
  },
  traits: { uploads: Upload.each({ of: "attachments", by: "ref", max: 10 }) },
})

export const EditorMachine = machine(Editor, ({ S, E }) => ({
  default: S.EDITING,
  on: {
    Attach: { updateMemory: ({ event, memory }) => ({ attachments: [...memory.attachments, { ref: event.ref }] }) },
    Remove: { updateMemory: ({ event, memory }) => ({
      attachments: memory.attachments.filter((a) => a.ref !== event.ref),
    }) },
    CancelAll: { raise: [E.uploads.Cancel] },
  },
  traits: {
    uploads: { onGone: { updateMemory: ({ event, memory }) => ({ gone: [...memory.gone, event.ref] }) } },
  },
}))
```

What each line costs the runtime: `Attach` r1 gives `Start` at `[{ slot: "uploads", key: "r1" }]`; `Remove` r1
gives `End(KeyGone)` and one `onGone` in the same turn; `CancelAll` is table 3.4; `Done` leaves as
`Emitted { address, name: "Done" }` and a view hears it under `uploads` with the copy's key (T77 owns the handler
shape). A subroutine, a node trait and `.resumable()` use the Plan's spelling the same way; the typed machine consult
owns the builder types.

### 3.6 Why a second writer cannot be written

- `Instances` is opaque: only `instances.ts` constructs one, so a literal, a spread, `Object.assign` or an aliased
  `Map` copy elsewhere is a type error. The `timers-decided` guard missed exactly those three forms (T57 close review).
- One stale check, `ownerLive(incarnation, owner)`, replaces the three in 1(3): it compares the `InstanceId` or
  `ActivationId` the mail carries with what is stored. A `Frozen` owner parks the mail; an absent one makes it late.

## 4. Requirements and Invariants

| Id  | Rule                                                                  | Source                        | Fails on a wrong build when              |
| --- | --------------------------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| R1  | a trait sits on the root, a node or a subroutine state                | Machines O1                   | a node trait lives off its node          |
| R2  | `.each`: one copy per repaired key; repair never refuses              | Machines O1, O3               | an 11th key refuses                      |
| R3  | a changed reset value is a new incarnation; null is not placed        | Machines O1                   | memory survives a reset                  |
| R4  | `.resumable()` freezes on leave; thaws memory, timers, endings        | Machines O1, O5               | a thawed slice is fresh                  |
| R5  | a subroutine: default entry, exit or abandon, every exit filled       | Machines O2                   | `"self"` above re-enters it              |
| R6  | `whenAbandoned` once, in the ending turn, not on exit or freeze       | Machines O1, O3; Turn I11     | runs on an exit                          |
| R7  | a fan-out raise follows table 3.4                                     | Machines O1; ui-primitives R4 | a denial skips                           |
| R8  | snapshot slices: undefined absent, present frozen, lists in key order | Machines O8                   | frozen reads undefined                   |
| R9  | restore: new ids, table 3.3 against the current definition            | Restore R1, R7                | an old id survives                       |
| R10 | an emit carries its address; every scope reads root props             | ui-primitives Q3c, R3         | a copy's emit has no key                 |
| I1  | published `Live` set equals wanted, unless `unsettled`                | 3.3                           | an instance is extra or missing          |
| I2  | a `Live` instance's host is `Live`; a frozen subtree is frozen        | 3.3                           | a child ticks when frozen                |
| I3  | an `InstanceId` is never reused, in a run or across a restore         | Actors I13                    | a restart keeps its id                   |
| I4  | nothing owed to an ended instance reaches a later one                 | Actors I17                    | a late ending lands in new `r1`          |
| I5  | copies' keys equal the repaired keys, in list order, at most `max`    | Machines O1                   | keys reorder                             |
| I6  | `addressKey` is injective and never parsed                            | prototype D57                 | keys `a/b` and slot `a`, key `b` collide |
| I7  | only `settle`'s result changes existence or status                    | epic "one owner"              | the type guard is bypassed               |

Table 3.3's rows are R1 to R4, R6 and R9 crossed with the two stored statuses; each row cites its rule in the test
table. Table 3.4's rows are R7. Table 3.2 is R5 mapped onto code that exists.

## 5. Development strategy

Build order, each step resting on the one before:

1. **Spike the turn's parts** (two days at most, in a scratch file, not production): extend `runTurn` to walk one
   `raise` into a root trait and one `notify` back, with "one state changer" and "disjoint memory keys". This is the
   largest unknown and no Task owns it. If it does not fit `TurnResult`, T109 is blocked on a turn Task (PD5).
2. **Compiled data**: `slots`, `fragments`, scopes on nodes, subroutine states flattened (3.2). Fed as hand-built
   compiled data first, as the prototypes did; the builder types come from T113.
3. **`settle` as a pure function with its table test**, before any runtime wiring. Tables 3.3 and 3.4 are the test.
4. **Wire the occasions**: `start`, the turn's commit, the reset follow-up, `boot`, `end` and disposal. Then the
   seams in order: schedules occasions, `OwnedBy.Instance` and releases, the snapshot view, the saved record.
5. **`Story.fragment`**, fixtures per kind placed in a host, `flow check` findings.
6. **T110**: the fan-out table on top of the live copies in key order.

Risk, highest first: the parts walk (step 1); the type level (`StateName` and `ActorName` admitting fragment paths,
the `pausedBy` union and typed `key` that T57 pinned to T113); freeze and thaw against the schedules owner (a frozen
timer is `Timing.Held`, which exists); settle cost with many copies (bench, 6).

Task split by state ownership:

- **T109 stays one Task** for the instance table: placement, `.each`, nesting, reset, resumable, `whenAbandoned` and
  restore all write one state, so splitting them would give the table several owners again. Subroutines are its
  first slice because they write none of that state (3.2).
- **T110 stays the fan-out**: it owns no state and reads T109's live copies.
- **New, proposed: a Task for the turn's parts** ahead of T109, unless the spike shows it is small (PD5).

## 6. Testing strategy

**The sequence test.** One host with every kind: a root trait with `resetOn`, a node trait, a resumable node trait, a
root `.each` whose fragment nests a trait, and a subroutine whose slice nests an `.each`. An alphabet of steps (enter
and leave each node, take an exit, add, remove, reorder and re-add keys, duplicate and over-`max` keys, change and
null the reset value, fan-out raise, freeze, thaw, end, restore). All sequences of length 1 to 4 from each start.

**The oracle is not the diff.** After every step it recomputes wanted from the facts from scratch (a few lines,
written from the wanted table, not from `settle`) and checks I1 and I2; it keeps a ledger of `whenAbandoned` owed
(one per ended id, zero for `Exit`, `Freeze`, `Dropped`) and of every id ever minted (I3, I4).

Dimensions earlier reviews missed, each a column of the generator:

- **several keys**: 0, 1 and 3 copies; assertions read every copy, never the first (T57: one key hid the bug);
- **non-default starts**: begin inside the subroutine's second state, with a frozen instance, with `unsettled` set;
- **sequences over time**: a key removed and re-added in one turn (kept) against across two turns (new id);
- **restore after a definition edit**: slot reordered, added, removed, renamed; `by` changed; `max` lowered; a trait
  made resumable and back; a subroutine state renamed;
- **hostile fakes**: an operation ending for an ended copy, for a frozen copy that then thaws, for a frozen copy that
  then ends; a timer firing for a frozen copy; more than `drainYield` mail queued for a copy that leaves.

Planted faults (each must fail a named row): skip `whenAbandoned` on `KeyGone`; run it on `Exit`; keep the id on a
reset; thaw with fresh memory; drop timers on freeze; fan-out reaches a copy started this turn; fan-out in sorted
order; a copy's denial skips; a child outlives its host; restore keeps old ids; reset compared by reference;
`addressKey` without escaping.

The guard is the opaque `Instances` type (3.6) plus a type test that a literal, a spread and an aliased `Map` each
fail to compile.

Bench: a turn on a machine with no slots must not move (`settle` returns at once when `Compiled.slots` is empty);
`settle` with 1, 10, 100 and 1000 copies when the list is unchanged and when one key changes; a fan-out over 100
copies; the snapshot view with 100 copies. Cache the view only if the bench says so.

## 7. Handoff for the Opus leads

**T109.** Read first: this file's 3.1 to 3.3, @plan.Machines.O1 to O3 and O8, `src/core/tree.ts`,
`src/core/incarnations.ts`, `prototypes/round-14/inc.ts` (rules only). Decided if the user accepts: the table and its
owner, the flat `Instances`, subroutines flattened. Open, settle before code: who builds the turn's parts (PD5);
`whenAbandoned` at an actor's end (PD3); key order (PD2); how a slot whose fragment is not yet adopted behaves
(T48: proposed "not wanted until adopted, adoption is a settle occasion"); whether `unsettled` is saved (ask the
saved-records owner; recommended: no, restore settles anyway). First commit: tables 3.2 and 3.3 as failing checks over
hand-built compiled data, the type guard test, and the sequence test's oracle with a `settle` that returns nothing.

**T110.** Read first: 3.4, ui-primitives-decisions R4 and S4. Decided: the table. Open: the loop guard's count for a
fan-out (T96's finding: sends per admitted event against chain depth); recommended: one raise, one count, whatever
the copies. First commit: table 3.4 as failing rows with 0, 1 and 3 copies.

**T77.** Takes `Emitted { address, instance, name, payload }` and `InstanceTree<Def>`. Open in T77: the handler shape
for a copy's key. **T76.** Takes nothing but "every scope reads the root's props". **T72, T106.** Wait on
`Story.fragment` (step 5). **T48.** See the open item above.

## 8. Proposed decisions

**PD1. Subroutine states compile into the host's tree; a subroutine keeps no lifecycle state.**
Trace A: `WIZARD.PROFILE`, `Cancel` targets `WIZARD.CANCELLING`; the leaf is `WIZARD.CANCELLING.ASKING` with a new
activation and a `Start` for its slice; `No` takes exit `declined` to `WIZARD.history`: `End(Exit)`, no
`whenAbandoned`. Trace B: in `ASKING`, WIZARD's own `Refresh: "self"` runs; `moveOf` exits nothing, the activation
is unchanged, the row is `Keep`. Reverse by giving each instance its own leaf, as the prototype did.

**PD2. Key order is the host list's order, not sorted keys.**
Trace A: list `[r2, r1]`; `CancelAll` reaches r2 then r1; the snapshot's `uploads` is r2, r1. Trace B: the user
reorders to `[r1, r2]` in one turn: both rows are `Keep`, no id changes, the next fan-out runs r1 first.

**PD3. At an actor's end no `whenAbandoned` callback runs; the releases it lists are applied.**
Trace A: `disposeActor` with copy r1 holding a lane: `End(ActorEnded)`, `Ended { releases }` goes to the lanes owner,
no host turn runs. Trace B: the same actor returns: r1 is a `Start` with a new id; nothing of the old one arrives
(I4). Reverse by running a last turn for the callbacks before the end.

**PD4. A membership fact changed by `whenAbandoned` or `resetOn` settles in a follow-up turn, never in a loop.**
Trace A: `onGone` for r1 removes r2 from the list: commit sets `unsettled`; before the next event the `Reset`
occasion ends r2 and runs its `onGone`. Trace B: `onGone` writes only `gone`: facts match, no follow-up. This widens
the Plan's "pending reset" to lists.

**PD5. A Task for the turn's parts ahead of T109, sized by the spike.** Scope change; the user's call.
Trace A: with it, T109's first commit runs `raise` into a trait on day one. Trace B: without it, T109 builds the
walk inside a lifecycle Task and two states get one Task.

Deferred, unchanged: open-items 21 (subject path as the admission rule for node traits), 22 (shared contract across
placements), 24 (release without interrupting), 26 (per-copy fan-out of writes). Item 3 stays closed: data survives
by placement or `.resumable()`.

## 9. Sidecar log

Three Haiku sidecars ran at effort high; no adversary ran (time). Five angles of the brief's eight were not started.

| Sidecar      | Finding                                                    | Ruling                                                         |
| ------------ | ---------------------------------------------------------- | -------------------------------------------------------------- |
| current code | no fragment feature; `Compiled` has no fragment field      | accepted; re-read `compiled.ts:409-425`                        |
| current code | `Incarnation` shape; single mint, set and delete           | accepted; re-read `world.ts:205-220`                           |
| current code | stale check written three ways; writers spread snapshots   | accepted; lines not re-read                                    |
| current code | driver registry may re-insert an ended id                  | not used; unverified, outside this concept                     |
| prototype    | returned a summary with no findings                        | rejected; I read `round-14/inc.ts` and `world.ts#Inc` myself   |
| tasks        | goals and blockers of the seven Tasks                      | accepted; T109's comment and T113 re-read                      |
| tasks        | T57 close review: one key and default starts hid two bugs  | accepted into 3.6 and 6; not re-read                           |
| tasks        | no user approval recorded for moving subroutines into T109 | changed: reported, not ruled on here                           |
| tasks        | Spec ids for the area                                      | used as citations only; ids not re-read against the Spec files |
