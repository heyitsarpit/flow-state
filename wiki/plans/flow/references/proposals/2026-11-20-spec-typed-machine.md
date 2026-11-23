---
proposal spec-typed-machine
status superseded 2026-11-23 [@proposal.algo-types]
    proposed 2026-11-20
---
# The typed machine: one source for every derived type

**Verdict: every type user code needs is derived from the definition (and, for endings, the contract); the machine
body is checked against the definition and never read back.** A `tsc` spike of eight shapes shows that TypeScript
cannot both check a body literal exactly and capture its type from the same argument. So the snapshot's schedule
fields are typed only if their names, keys and pause reasons are declared on the definition (ask 1). Everything else
in @task.V3.T113 needs no new word: mappers already infer, and `.Type` phantoms are two type-only properties.

Everything here is **proposed**. Asks are in section 8. Spike files and output:
`/private/tmp/claude-501/-Users-arpit--claude-spares-spare-4kkXXd/a725f531-3dec-4d58-90f5-b639943ea4d1/scratchpad/spike-typed/`
(`a.ts.txt` to `d.ts.txt`, `e.ts`; TypeScript 7.0.2, the repo's base options).

Sources: @task.V3.T113, @task.V3.T57 (type spike comment, 2026-11-20T10:49), @task.V3.T104 (`ExactBody`, reverted),
@questions.advisor-questions question 1, @plan.Machines.O1, @plan.Machines.O8, @spec.Turn (R16, R27).

## 1. What exists

Paths are under `packages/flow-state-v3/`.

| Part               | Where                                                                            | State                    |
| ------------------ | -------------------------------------------------------------------------------- | ------------------------ |
| Body check         | `src/machine.ts` `BodyOf<NoInfer<D>>`, `MachineBody<D>`, private `Parts<D>`      | Holds at depth 3 (T57)   |
| Machine            | `src/definition.ts:586` `Machine<D> = { definition: D; compiled }`               | Holds; has no body type  |
| Snapshot           | `src/host/snapshot.ts:50` `Snapshot<D, View>`; `schedules: Timers`               | `pausedBy` is `string[]` |
| Event token        | `src/event-tokens.ts` `EventToken`, `from: <V, R extends P>(map) => …`           | `V` infers from the slot |
| Endings            | `src/contract.ts` `WriteEndings<E, A, Id>`, `ReadEndings`, `Ending<V, Id>`       | Typed by the contract    |
| Schedules          | `src/tokens.ts` `ScheduleParts`, `KeyedConfig`; `Flow.keyed` (`src/flow.ts:308`) | `K` not in `send`        |
| Memory token       | `src/tokens.ts:377` `MemoryToken<V, Id, P>`; `Def.M` omits `Flow.private` fields | No `.Type`               |
| Definition Schemas | `Def.Event`, `Def.Memory`, `Def.Input`, `Def.State`, `Def.Snapshot`              | `.Type` works today      |

What holds, each run against the real `machine` in the spike:

- Every refusal the type tests pin: an unknown key at depth 2, a null handler, a misspelt duration, an unknown
  state, a default that is not a direct child, an unknown event. Each error lands on the offending property.
- An un-annotated ending mapper reads the contract's value (`tests/types/endings.test-d.ts:196-211`), and an
  un-annotated schedule `send` mapper reads the metadata (`e.ts` line 15: `attempt` is typed).
- A shared body compiles (`fixtures/services/shop/machines/pay.ts:170`, `PayBody`).

What is wrong or missing:

1. **The annotations are habit, not need.** 51 of the 52 annotated `.from` mappers sit where the type is already
   inferred: 44 in `outcomes`, 5 in `C.slot.change`, 2 in a schedule `send` (my count: 51 by regex, plus one
   multi-line). Nothing refuses the annotation, so the copy drifts from the contract.
2. **Helpers outside the body have no derived type to name.** About 76 hand-typed `{ memory }` and `{ event }`
   parameters and about 8 local `type` copies; `byRepo` is written three times and `fromAccount` twice.
3. **A schedule's send mapper reads `key` as `ScheduleKey`**, keyed or not (`e.ts` line 15).
4. **`Snapshot<D>["schedules"]` is `Timers`**: names, keys and `pausedBy` are untyped, because they are authored in
   the body and `Machine<D>` carries nothing of it (the inverted pin, `tests/types/schedules.test-d.ts:296`).
5. **Two excess-key holes compile today** (`e.ts` lines 13 and 14, against the real `machine`): an unknown key in a
   handler alternative (`{ target, gaurd: [] }`) and in an unkeyed schedule (`{ schedule, send, pausd: {} }`).
   T113's acceptance says excess keys "still fail"; these two never did.
6. `Parts<D>` is private to `machine.ts`, and `snapshot.ts` re-derives the same parts from `D["states"]`,
   `D["memory"]`. Each later field (props, emits, fragments, rule tokens) would add a third derivation.

## 2. State inventory

This concept owns no runtime state. It owns **type facts**: each one has a source that authors it and sites that
read it. The class of bug is a fact with two sources (the definition and a hand-written copy).

| Fact                | Source today                        | Read at                                             | Sources after                             |
| ------------------- | ----------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| Event payload       | definition `events`; 24 copies      | handlers, helpers, sends                            | definition (`E.X.Type`)                   |
| Memory              | definition `memory`; 52 copies      | handlers, helpers, snapshot                         | definition (`Def.Memory`, `Def.M.f.Type`) |
| Ending value        | contract `commit`; 52 annotations   | `outcomes` mappers                                  | contract (inferred)                       |
| Context slot value  | definition `context`; 5 annotations | `C.slot.change` mappers                             | definition (inferred)                     |
| Schedule name       | body `schedules` keys               | snapshot                                            | definition, if ask 1 is A                 |
| Schedule key        | body `Flow.keyed` `keys`            | `schedule`, `restartOn`, `paused`, `send`, snapshot | same                                      |
| Pause reasons       | body `paused` keys                  | snapshot `pausedBy`                                 | same                                      |
| State paths, leaves | definition `states`                 | body, snapshot                                      | definition (unchanged)                    |

Seams (type values only; no runtime value crosses):

| Neighbour                | Direction | What crosses                                                                          |
| ------------------------ | --------- | ------------------------------------------------------------------------------------- |
| Fragments (T109)         | they add  | one row of `SnapshotFields<D>`; they asked for `InstanceTree<Def>` derived from `Def` |
| Props (T76), emits (T77) | they add  | one declared part of `Definition`, one field of `Parts<D>`, one snapshot row          |
| Rules (T106)             | they read | `Parts<D>` and the token `.Type`s; no new carrier                                     |
| Reads and operations     | they own  | `Ending<V, Id>` and `WriteEndings`/`ReadEndings`; I read `V` only                     |
| Saved records            | they read | the declared schedule key Schema (ask 1 A) as the key's codec                         |
| Data layer               | none      | no type crosses                                                                       |

## 3. The design

### 3.1 One rule: the body is checked, never read back

`machine<D>(definition: D, body: BodyOf<NoInfer<D>>): Machine<D>` stays exactly as it is. No derived type reads the
body. A fact the snapshot shows must be declared on the definition.

Why, from the spike (each row a variant of `machine`'s signature, same body, same refusals):

| Variant                                                   | Captures          | Refusals kept                     | Result                                   |
| --------------------------------------------------------- | ----------------- | --------------------------------- | ---------------------------------------- |
| V0 today                                                  | nothing           | all six                           | baseline                                 |
| V1 `BodyOf<D> & ((t: never) => B)`                        | whole body        | 2 of 5 run, moved to the argument | excess keys lost                         |
| V2 `BodyOf<D> & F`                                        | whole body        | 2 of 5 run, moved to the argument | excess keys lost                         |
| V3 `(t) => MachineBody<D> & B` (T104's shape on `BodyOf`) | whole body        | 2 of 6, on the property           | excess keys lost                         |
| V4 V1 with `const B`                                      | whole body        | 2 of 5 run, moved to the argument | excess keys lost                         |
| V5 V3 plus a key validator                                | broken            | a valid body is refused           | rejected                                 |
| V7 a type parameter only at `schedules`                   | nothing (`never`) | all six                           | no inference: D is generic when B infers |
| V8 V7 curried, `machine(D)(body)`                         | first record only | 5 of 6; valid records refused     | rejected                                 |

The cause is one fact about TypeScript: an inferred type parameter that sees a literal learns its keys, so the same
literal can no longer be an excess key against it. A scoped parameter avoids that but is reached only through types
that depend on `D`, and inference runs before `D` is instantiated. This is the freedom to remove: **two sources for
what a machine's snapshot holds** (the definition and the body). One source needs no inference.

### 3.2 One decomposition, one snapshot map

`Parts<D>` moves from `src/machine.ts` to a new type-only module `src/derive.ts` and is exported inside the
package. `Snapshot` is built from one map, and each neighbour adds one row.

```ts
// src/derive.ts (NEW file, types only)
// Parts<D> moves here from machine.ts, unchanged: Context, Tree, S, Leaves, Events, Memory, Writable, Id.

// NEW: one row per snapshot field, each a function of D alone.
export type SnapshotFields<D extends AnyDefinition, View extends "inside" | "outside"> = {
  readonly state: Parts<D>["Leaves"];
  readonly memory: View extends "outside" ? OutsideOf<D["memory"]> : Parts<D>["Memory"];
  readonly operations: ReadonlyMap<keyof D["operations"] & string, ReadonlyMap<string, Row>>;
  readonly lifecycle: Lifecycle;
  readonly context: Parts<D>["Context"];
  readonly issues: ReadonlyArray<Diagnostic>;
  readonly schedules: TimersOf<D>; // ask 1: typed (A) or `Timers` (B)
  // T76 adds `props`, T77 adds `emits`, T109 adds `fragments`: one line each, nothing else.
};
```

`src/host/snapshot.ts` keeps `Erased<D>` and becomes `Erased<D> extends true ? WideSnapshot : SnapshotFields<D,
View>`. The rule for neighbours: **a new field is a declared part of `Definition`, a field of `Parts<D>` and a row of
`SnapshotFields`; it never adds a type parameter to `Machine`, `ActorRef`, `Actor` or `Snapshot`.**

### 3.3 Phantom `.Type` on tokens

Type-only properties, absent at run time, as Effect's Schema declares `readonly "Type": T` on an interface and sets
no such key (`codebases/effect-v4/packages/effect/src/Schema.ts:169`).

```ts
// src/event-tokens.ts: EventToken gains one member
readonly Type: P; // NEW (phantom): what a handler, guard or mapper reads as `event`

// src/tokens.ts: MemoryToken gains one member
readonly Type: V; // NEW (phantom): the field's decoded value
```

`E.X.Type` is the **payload**, not the envelope (ask 2). A handler's `event` is the payload (`src/core/turn.ts:434`),
and a helper typed by the envelope is refused as a handler (`e.ts` line 23); typed by the payload it compiles
(`e.ts` line 21). The envelope already has a name, `EventOf<D>` and `typeof Def.Event.Type`.

Before and after, a helper outside the body (`fixtures/sync/machines/sync.ts:52`, also in `lanes` and a test):

```ts
// before: a copy nothing checks, written three times
const byRepo = ({ event }: { readonly event: { readonly repo: string } }) => ({ repo: event.repo });

// after: one helper beside the definition          // existing: Sync, E     // NEW: .Type
export const byRepo = ({ event }: { readonly event: typeof Sync.E.Changed.Type }) => ({ repo: event.repo });
```

Memory, where the data comes from the definition's own Schemas:

```ts
// before
const fromAccount = ({ memory }: { readonly memory: { readonly account: string } }) => ({ account: memory.account });

// after: one field                                  // NEW: .Type on the existing M token
type Account = typeof StandingOrder.M.account.Type;
const fromAccount = ({ memory }: { readonly memory: { readonly account: Account } }) => ({ account: memory.account });
// after: the whole memory, private fields included  // existing: Def.Memory (a Schema)
const handleOf = ({ memory }: { readonly memory: typeof Session.Memory.Type }) => ({ handle: memory.handle });
```

`Def.M` has no token for a `Flow.private` field (`e.ts` line 27), so a private field is read as
`(typeof Def.Memory.Type)["field"]`. No token is added for it: `M` tokens are what other definitions may read.

### 3.4 Mappers: delete the annotation

No new word. The parameter is already the contract's value, the slot's value or the schedule's metadata.

```ts
// before (fixtures/session/machines/session.ts:26)
signIn: signIn.outcomes({
  success: E.SignedIn.from((p: { readonly user: string; readonly displayName: string }) => ({
    user: p.user,
    displayName: p.displayName,
  })),
  failure: { Refused: E.Refused.from((e: Refused) => ({ reason: e.reason })) },
  notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
  unknown: E.Unsure,
}),

// after: every parameter inferred from signIn's commit
signIn: signIn.outcomes({
  success: E.SignedIn.from((p) => ({ user: p.user, displayName: p.displayName })),
  failure: { Refused: E.Refused.from((e) => ({ reason: e.reason })) },
  notSent: E.NotSent.from((e) => ({ why: e.why })),
  unknown: E.Unsure,
}),
```

The fallback in T113 (one exported ending type per contract) is **not needed**: no surveyed mapper sits outside a
typed slot. The lint rule of section 6 keeps the annotation from coming back.

### 3.5 Schedule keys in the send mapper

`ScheduleMetadata` takes the key as a parameter, and `ScheduleParts.send` uses the schedule's own `K`:

```ts
// src/tokens.ts
export type ScheduleMetadata<K = ScheduleKey> = {   // changed: the parameter K
  readonly name: string;
  readonly attempt: number;
  readonly armedAt: number;
  readonly dueAt: number;
  readonly firedAt: number;
  readonly output: unknown;
  readonly key: K;                                   // changed: was ScheduleKey
};

// in ScheduleParts<M, Ev, Id, Cx, K>
readonly send: ({ readonly tag: keyof Ev & string } | { readonly ending: { readonly event: keyof Ev & string } }) &
  Ending<ScheduleMetadata<K>, Id>;                   // changed: was Ending<ScheduleMetadata, Id>
```

- **Unkeyed:** `ScheduleConfig` fixes `K = undefined`, so `key` is `undefined`. Not yet run; first spike item.
- **Keyed:** `K` is inferred in the same `Flow.keyed({ … })` call that holds `send`, and the nested `E.X.from`
  resolves first, so `key` stays `ScheduleKey`. It is typed when `K` is fixed before `send` is read. Two ways, both
  run: a concrete `K` in the contextual type (`e.ts` lines 32 and 33, the wrong field refused), which ask 1 A gives;
  or `K` from an earlier argument, `Flow.keyed(keys, config)` (`e.ts` lines 36 and 37), which is ask 3.

### 3.6 The snapshot's schedules (ask 1, option A)

The definition declares each schedule's name, its key and its pause reasons; the body's `schedules` are then checked
against them like `on` is checked against `events`.

```ts
// definition: NEW key `schedules`; `key` and `pausedBy` are NEW; names are user-defined
export const Room = definition({
  id: "home/Room",
  states: ["OFFLINE", { ONLINE: ["IDLE", "BUSY"] }],
  events: { Flip: {} },
  internalEvents: { Polled: { id: Schema.String }, Tick: {} },
  memory: { sensors: Flow.initial(Schema.Array(Schema.Struct({ id: Schema.String })), []) },
  schedules: {
    poll: { key: { id: Schema.String }, pausedBy: ["Vacation", "Saving"] },
    check: { pausedBy: ["Quiet"] },
    beat: {},
  },
});

// machine: unchanged words; now checked against the declaration
export const RoomMachine = machine(Room, ({ S, E }) => ({
  default: S.OFFLINE,
  states: {
    OFFLINE: {
      schedules: {
        poll: Flow.keyed({
          keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
          schedule: "1 minute",
          paused: { Vacation: ({ key }) => key.id === "", Saving: () => false },
          send: E.Polled.from(({ key }) => ({ id: key.id })), // key: { readonly id: string }
        }),
      },
    },
  },
}));

// read: typed by the definition alone (a Story's read, or actor.getSnapshot())
const idOf = (snapshot: Snapshot<typeof Room>) => snapshot.schedules.poll?.[0]?.key.id; // string | undefined
const quiet = (snapshot: Snapshot<typeof Room>) => {
  const check = snapshot.schedules.check; // { dueAt } | { left; pausedBy: ReadonlyArray<"Quiet"> } | undefined
  return check !== undefined && "pausedBy" in check && check.pausedBy.includes("Quiet");
};
```

Added: `definition({ schedules })`, `TimersOf<D>`, a compile refusal for a body schedule that is not declared, one
for a `paused` key that is not a declared reason, and one for a keyed entry under an unkeyed name (and the reverse).
Dropped: `Timers` as the typed snapshot's field (it stays the erased form). Nothing is added to `Machine`.

Stored versus derived: the declaration is stored once, in the definition. `TimersOf<D>`, the body's allowed names
and `K` are derived from it. Compiled gains nothing: the compiler only checks the body against the declaration.

### 3.7 The two excess-key holes

Both are unions (`OneAlternative`, `ScheduleEntry`). The cause is not yet found; the first step is to find which
member admits the unknown key. With ask 1 A the schedule hole closes by structure, because a declared name's entry
is one member, not a union. The alternative hole stays in T113 as an inverted pin until its cause is known.

### 3.8 No transition table

No state here has two writers at run time. The table this concept owes is section 2's: one source per fact.

## 4. Requirements and Invariants

Each is a check that fails on a wrong build. "Two-sided" means a correct line beside a refused line.

- **R1.** `E.X.Type` equals the event's payload; a wrong field is refused. Source: T113; ask 2. Check: two-sided type
  test.
- **R2.** `Def.M.f.Type` equals the field's decoded value; a private field has no token. Source: T113;
  `definition.ts:285`. Check: two-sided type test.
- **R3.** An un-annotated mapper in `outcomes`, `C.slot.change` and a schedule `send` reads the slot's value. Source:
  T113; `endings.test-d.ts:196`. Check: type test per slot kind.
- **R4.** An unkeyed schedule's send mapper reads `key` as `undefined`. Source: T113 comment 13:03. Check: two-sided
  type test.
- **R5.** A keyed schedule's send mapper reads its key record. Source: @spec.Turn R16. Check: replaces the `today`
  pin, `schedules.test-d.ts:58`.
- **R6.** A snapshot's `pausedBy` is the schedule's declared reasons; its key the declared key. Source:
  @plan.Machines.O8, Turn R27. Check: replaces the pin at `schedules.test-d.ts:296`.
- **R7.** Every body refusal of today holds, on the offending property, at depths 1 to 3. Source:
  `excess-keys.test-d.ts`; T104. Check: existing tests, unchanged.
- **R8.** A shared body (`PayBody`) compiles and is refused for a wrong key. Source: T113 false pass. Check: type test
  on `pay.ts`'s shape.
- **R9.** A body schedule, pause reason or keyed-ness not in the declaration is refused, by type and at compile.
  Source: ask 1 A. Check: type test and a construction test.
- **I1.** No derived type reads the machine body; `Machine`, `ActorRef`, `Actor`, `Snapshot` keep their parameters.
  Source: section 3.1. Check: type test: `Machine<typeof D>` equals `machine(D, …)`'s type.
- **I2.** A `.Type` is never a run-time key. Source: Effect's Schema. Check: unit test: `"Type" in Def.E.X` is false.
- **I3.** No hand-written event, memory or ending annotation where a derived type exists. Source: T113; the survey.
  Check: lint rule with plants.
- **I4.** A changed payload, memory field or contract value breaks every site that reads it. Source: T113. Check: one
  planted change per kind (section 6).
- **I5.** An erased definition (`AnyDefinition`) still gets the wide snapshot. Source: `snapshot.ts:40` `Erased`.
  Check: existing `snapshot.test-d.ts`.

R5 and R6 hold only under ask 1 A (R5 also under ask 3). Under ask 1 B they stay inverted pins, reworded as
by-design.

## 5. Development strategy

Order, each step resting on the one before:

1. **Spike, 45 minutes, before any production edit.** In a scratch file against the real `src/`: (a) R4, the unkeyed
   `key: undefined` through `ScheduleMetadata<K>`; (b) `.Type` on both tokens with I2; (c) under ask 1 A, the
   declared `schedules` checked in a real `MachineBody` at depth 3 with all six refusals of section 3.1 still on
   their properties; (d) which union member admits `gaurd` and `pausd`. Paste the `tsc` output in the Task.
2. **`src/derive.ts`:** move `Parts<D>`, add `SnapshotFields`; `Snapshot` reads it. No behaviour change; every
   existing type test passes unchanged. This is the seam the neighbours need, so it lands first.
3. **`.Type` phantoms and `ScheduleMetadata<K>`** (R1, R2, R4), with their tests red first.
4. **The sweep:** delete mapper annotations, retype helpers, move `byRepo` and `fromAccount` beside their
   definitions; then the lint rule, so the sweep is proven complete by the rule passing.
5. **Declared schedules** (R5, R6, R9), only after the user answers ask 1.

Risk, highest first: step 1c (a new mapped type inside `MachineBody` could bring back the depth-2 widening T57
fixed: keep it under `BodyOf`'s conditional and re-run T57's depth-3 probes); `tsc` time on deep trees; the sweep
touching 25 fixture files that other Tasks also edit (do it in one commit per fixture app).

Task split, by who owns each fact:

- **T113 keeps** steps 1 to 4: the token `.Type`s, the mapper sweep, the unkeyed key, `derive.ts`, the lint rule.
  It needs no public shape decision beyond ask 2.
- **A new Task, "Declared schedules"** (proposed, blocked by ask 1): step 5, R5, R6, R9 and the schedule
  excess-key hole. It owns the `schedules` declaration; saved records read its key Schema.
- T76, T77, T109 and T106 are unchanged in scope; each adds its row to `SnapshotFields` after step 2.

## 6. Testing strategy

Wrong endings and what catches each:

| Wrong ending                                   | Caught by                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| A type infers on the happy path only           | two-sided tests: every R has a refused line naming its rule      |
| A capture that silently loosens the body check | R7's tests unchanged, plus the six refusals at depths 1, 2 and 3 |
| `.Type` reads as `any` or `never`              | `expectTypeOf(...).toEqualTypeOf` (exact), never `toMatchTypeOf` |
| A copy survives the sweep                      | the lint rule over `fixtures/`, `tests/`, `bench/`               |
| A derived type that does not track its source  | I4's planted changes                                             |

Dimensions earlier reviews kept missing, as rows of one type-test table (`tests/types/derived.test-d.ts`):

- **Several keys and copies:** a key record of two fields; two keyed schedules in one machine; one schedule name
  declared and used at two depths is refused (names are machine-wide, `src/compile-schedules.ts:131`).
- **Non-default starts:** a definition with no schedules, no memory, no context, no operations (each `Parts` field
  empty, not `never` or `unknown`); payload-free events (`E.X.Type` is `{}`); an optional memory key.
- **Views:** `"inside"` and `"outside"` snapshots; `Flow.private` fields; an erased definition; a union of
  definitions (`inspect`'s `Snapshot<DefsOf<A>>` must distribute).
- **Shapes of body:** inline, shared (`PayBody`), a body that spreads a shared body (`fixtures/cells`).
- **After a definition edit:** type-level, I4. Run-time (a saved timer whose schedule or reason is no longer
  declared) belongs to saved records; this concept gives them the declared names and key Schema.
- **Hostile input:** a widened `string[]` states list, a `string` id, a definition cast to `AnyDefinition`.

Planted faults (`nub run faults`): four patches, each applied to a copy of one fixture definition, each expecting
`tsc` to fail at a listed set of sites: rename a payload field, change a memory field's Schema, change a contract's
success value, rename a pause reason. A patch that fails at zero sites is the fault.

The guard: a `tools/flow-state-lint` rule, `no-hand-typed-derived`, refusing (1) a type annotation on the parameter
of an arrow passed to `.from(…)`; (2) a parameter whose type literal has an `event` or `memory` property typed by a
type literal; (3) a local `type Memory = { … }` in a file that imports a definition. Plants: one per form, plus one
allowed line each (`typeof Def.Memory.Type`, an un-annotated mapper).

Bench: record `tsc --extendedDiagnostics` check time and instantiation count for the package before step 2 and
after steps 3 and 5; a rise above 10% is reviewed. No run-time bench: nothing here runs.

## 7. Handoff for the Opus leads

**T113 (steps 1 to 4).**
- Read first: this file's sections 3 and 4; `src/machine.ts` (`BodyOf`); `tests/types/excess-keys.test-d.ts`;
  T57's spike comment; the spike's `e.ts`.
- Decided (by evidence, not the user): no capture of the body; mappers need no new word.
- Settle before code: ask 2 (payload or envelope); the cause of the `gaurd` hole (spike item d).
- First commit: `tests/types/derived.test-d.ts` with R1 to R4, R8 and I1 failing; the unit test for I2; the lint
  rule's test with its plants failing; inverted pins for the two holes of section 3.7.

**Declared schedules (step 5), if ask 1 is A.**
- Read first: section 3.6; `src/tokens.ts:222-354`; `src/compile-schedules.ts`; @proposal.schedule-issues;
  @proposal.spec-saved-records (who reads the key Schema).
- Decided: nothing until the user answers.
- Settle before code: whether `key` is a field record (as `events` are) or a Schema; whether an undeclared
  schedule is a type error only or also a `FlowError` (proposed: both, as with events).
- First commit: R5, R6 and R9 as failing type tests replacing the two `today` pins; a construction test per
  refusal; spike item c's output in the Task.

**T76, T77, T109, T106.** Read section 3.2. Add one declared part, one `Parts` field, one `SnapshotFields` row.
Do not add a type parameter to `Machine` or infer from the body.

## 8. Proposed decisions and sidecar log

### Ask 1: where a schedule's name, key and pause reasons are declared [answered: user 2026-11-21; A, on the definition: @proposal.spec-handover#declared-schedules]

- **A (recommended): on the definition** (section 3.6).
  - Trace 1: `snapshot.schedules.poll?.[0]?.pausedBy.includes("Vacaton")` → `TimersOf<typeof Room>` gives
    `ReadonlyArray<"Vacation" | "Saving">` → refused at compile.
  - Trace 2: `send: E.Polled.from(({ key }) => ({ id: key.id }))` → the slot's type comes from `Room`, so `K` is
    `{ id: string }` before `.from` resolves (`e.ts` line 32) → `key.idd` refused (line 33).
  - Cost: each schedule is named twice (definition and body), as events and operations are; 24 fixture
    `schedules` blocks gain a declaration. Not yet run inside the real `MachineBody` (spike item c).
- **B: stay wide.** `pausedBy` is `ReadonlyArray<string>`; T113's first two acceptance items become by-design pins.
  - Trace 1: the same read with `"Vacaton"` compiles and is always false.
  - Trace 2: the keyed mapper reads `key["id"] ?? ""` as today, unless ask 3 is taken.
- Not offered: capturing the body. Eight shapes failed (section 3.1); curried `machine(D)(body)` also failed.

### Ask 2: `E.X.Type` is the payload (recommended) or the envelope [answered: user 2026-11-21; payload, as prior art: @review.spec-cohesion-r2#public-surface-trims-as-proposed]

- Payload. Trace 1: `({ event }: { event: typeof E.Changed.Type })` passed as `updateMemory` compiles (`e.ts` line
  21). Trace 2: `send(actor, E.Changed({ repo }))` is unaffected; the envelope stays `EventOf<D>`.
- Envelope (T113's wording). Trace 1: the same helper is refused as a handler (`e.ts` line 23), so the 24 event
  sites cannot use it. Trace 2: a `send` helper could name one envelope, which `ReturnType<typeof E.X>` already does.

### Ask 3 (only if ask 1 is B): `Flow.keyed(keys, config)` [dropped: user 2026-11-21]
Why: ask 1 is A and Flow.keyed is dropped: @proposal.spec-handover#no-flowkeyed.

- Two arguments. Trace 1: `K` infers from `keys`, then `send`'s mapper reads it (`e.ts` lines 36, 37). Trace 2: 14
  `Flow.keyed` call sites change shape; the accepted one-object form goes. Run only with a `keys` that takes no
  argument; the real `({ memory }) =>` form is the first thing to run.
- Keep one object: the keyed send mapper's key stays `ScheduleKey`, pinned as by-design.

### Sidecar log

Four Haiku sidecars, read-only, effort high.

- **Survey:** 52 annotated mappers; 44 in `outcomes`, 5 in `change`, 2 in `send`, 1 in a samples array. **Accepted:**
  my regex counts 51 single-line; placement spot-read in `session.ts`.
- **Survey:** 52 memory and 24 event parameter lines, against T113's 25 and 18. **Changed:** it counts named types and
  tests too; I use "about 76" and the 39 destructured forms I counted.
- **Survey:** `byRepo` three times, `fromAccount` twice. **Accepted:** paths read.
- **Snapshot:** `Snapshot` at `src/host/snapshot.ts:50`, `Timers`, `TimerView` verbatim. **Accepted:** lines 40-83
  re-read.
- **Snapshot:** no `AnyMachine`; `Machine<D>` at `definition.ts:586`. **Accepted:** read in full.
- **Snapshot:** 332 `machine(` lines; non-inline bodies only in `pay.ts`, `cells.ts` and two tests. **Accepted, not
  recounted:** used only for cost.
- **Contract:** `.from`'s `V` is free and infers from the slot's `Ending<V>`. **Accepted:** `event-tokens.ts` read;
  `e.ts` line 15 run.
- **Contract:** there is no `O.x.start`; endings are bound in `outcomes`. **Accepted:** corrected my own wording;
  `definition.ts` read.
- **Contract:** `KeyedSchedule` does not carry `K`. **Accepted:** `tokens.ts:319` read.
- **Prior art:** Schema's `Type` is an interface field with no run-time key. **Accepted:** `Schema.ts:169` grepped;
  run-time claim not executed, so I2 tests ours.
- **Prior art:** `HttpApiBuilder.group` types a callback from an earlier argument. **Accepted as prior art for ask
  3:** not re-read; `e.ts` line 36 run instead.
- **Prior art:** ui-sdk comments on inference order in one literal. **Rejected for use:** same limit, no new
  technique.

Not done in the time box: an adversary sidecar on section 3.6; spike items a to d of section 5.
