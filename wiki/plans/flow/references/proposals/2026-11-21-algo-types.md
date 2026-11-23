---
proposal algo-types
status proposed 2026-11-21
description Proposes every user-visible type as a row of one type-only `derive.ts`, and construction as Built, Refused or Blocked.
---
# Types and compile: one derivation, three crossings, construction as a value (2026-11-21)

**Bottom line:** every type user code sees is a row of one type-only module, `derive.ts`, computed from the
definition; the body is captured exactly (C6) and gives the machine only what the body alone authors, its rule
names. The core stays erased and is not generic in `D`; a type crosses between the typed shell and the erased core
at three named functions and nowhere else. Construction never throws for a finding: a machine is `Built`, `Refused`
or `Blocked`, so `flow check` reports every machine of an app. `Compiled` gains its codecs, its rules and an index
built by one pass. The schedule declaration, the rule names, the mapper context and the contract rules compiled
against the real package; section 17 lists what did not or was not run.

Everything here is **proposed**. Cluster 5a of @proposal.algorithm-round. It designs past
@proposal.spec-typed-machine (TM) and @proposal.spec-static-rules (SC); each departure is a question in section
14. Paths are under `packages/flow-state-v3/`. AS, AT, AR and AO are @proposal.algo-schedules,
@proposal.algo-turn, @proposal.algo-records and @proposal.algo-operations; CS is @review.case-studies; R2 is
@review.spec-cohesion-r2; BCS is @proposal.body-capture-settled. This was the lead's only run.

## 1. Walkthrough: a keyed toaster with no type annotations

```ts
// existing: definition, machine, Flow.initial, Schema, Schedule, S, E, on, default, states, send, schedule, keys
// NEW: `schedules` on the definition (key, pausedBy, restartOn); `rules` and `turn` in the body; no Flow.keyed
// user-defined: Toaster, ToasterMachine, brown, idle, LidOpen, Drop, Pop, Browned, Ping, NeverOverFour, PopKeepsSlots
export const Toaster = definition({
  id: "Kitchen/Toaster",
  states: ["IDLE", { TOASTING: ["LIGHT", "DARK"] }, "DONE"],
  events: { Drop: { slot: Schema.String }, Pop: {} },
  internalEvents: { Browned: { slot: Schema.String }, Ping: {} },
  memory: { slots: Flow.initial(Schema.Array(Schema.Struct({ id: Schema.String })), []) },
  schedules: {
    brown: { key: { slot: Schema.String }, pausedBy: ["LidOpen"], restartOn: Schema.Number },
    idle: {},
  },
});

export const ToasterMachine = machine(Toaster, ({ S, E, turn }) => ({
  default: S.IDLE,
  on: { Drop: S.TOASTING.LIGHT, Pop: S.DONE, Browned: S.DONE, Ping: S.IDLE },
  states: {
    IDLE: { schedules: { idle: { schedule: "5 minutes", send: E.Ping } } },
    TOASTING: {
      default: S.TOASTING.LIGHT,
      schedules: {
        brown: {
          keys: ({ memory }) => memory.slots.map((s) => ({ slot: s.id })),   // must return { slot: string }[]
          schedule: ({ key }) => Schedule.spaced(key.slot === "bagel" ? "45 seconds" : "30 seconds"),
          restartOn: ({ memory }) => memory.slots.length,                     // must return number
          paused: { LidOpen: ({ memory }) => memory.slots.length > 4 },       // only the declared reason
          send: E.Browned.from(({ key }) => ({ slot: key.slot })),            // key typed; payload checked
        },
      },
    },
  },
  rules: {
    invariants: { NeverOverFour: { in: S.TOASTING, check: ({ memory }) => memory.slots.length <= 4 } },
    turns: { PopKeepsSlots: turn({ on: E.Pop, check: ({ before, after }) => after.memory === before.memory }) },
    terminals: [S.DONE],
  },
}));
```

Followed through:

- **A snapshot read** (a handle's `getSnapshot()` or a Story's `read(ref)`): `snapshot.state` is
  `"IDLE" | "TOASTING.LIGHT" | "TOASTING.DARK" | "DONE"`; `snapshot.schedules.brown?.[0]?.key.slot` is
  `string | undefined`; `pausedBy` is `ReadonlyArray<"LidOpen">`; `snapshot.schedules.bown` and
  `pausedBy.includes("LidOpn")` do not compile. All from `typeof Toaster`; nothing comes from the body.
- **A send:** `actor.send(Toaster.E.Drop({ slot: "a" }))` compiles; `Drop({ slots: "a" })`, `Drop({ slot: 1 })`
  and another definition's event do not. `Toaster.E.Drop.Type` is `{ readonly slot: string }`.
- **A Story step:** `story.send(toaster, Toaster.E.Drop({ slot: "a" })).checkpoint("browning")`, then
  `run.checkpoints.browning.read(toaster).schedules.brown`; `.rules({ expectBroken:
  [ToasterMachine.rules.NeverOverFour] })` compiles and `ToasterMachine.rules.NeverOverFor` does not. The rule
  names are the one fact that comes from the body.
- **`flow check`:** nothing targets `TOASTING.DARK`, so it prints
  `warning StateUnreachable Kitchen/Toaster states.TOASTING.states.DARK` with `toaster.ts (export
  ToasterMachine)` and exits 0. Change `idle`'s delay to `"-5 minutes"`: `machine()` does not throw; the machine
  is `Refused`, `flow check` prints `error DelayOutOfRange Kitchen/Toaster states.IDLE.schedules.idle.schedule`
  beside the findings of every other machine of the app and exits 1; starting a Runtime or running a Story of
  that app fails with one `FlowError` holding the same findings.

The block compiled as written, with no annotation, on one merged copy of the real package, and every bullet's
type claim was asserted two-sided there (`g1-walkthrough.ts`). The `flow check` bullet is design: no `check`
command exists today. On a machine that is not `Built` the `rules` record is empty at run time although its type
names the rules; every reader of a rule token is a Story or a setup, which raises first (7.2).

## 2. Required properties, in user terms

- **P1. Nothing is typed by hand.** A handler, mapper, schedule callback, rule, snapshot read, send or Story step
  needs no annotation, and no user type restates a Schema or a declaration.
- **P2. A misspelt name does not compile** wherever Flow holds the name: a state, event, field, operation,
  schedule, key field, pause reason, rule or slot, in the body and at every reader.
- **P3. A type never promises what the runtime does not deliver.** An unkeyed schedule's `key` is `undefined` in
  the type and at run time; a snapshot field is typed exactly as it is published.
- **P4. A definition or body with a finding is reported, whole, beside every other machine's findings.** It
  never hides another machine and never shows only its first finding; one whose construction has an error never
  runs. An argument of the wrong kind (not a definition, not a function) is a module that does not load.
- **P5. A finding says where:** the machine, the definition path, and the file when the CLI can resolve it.
- **P6. The same source gives the same machine:** no environment, clock, random or stack read at construction.
- **P7. Types and construction stay cheap:** check time grows by a stated bound; construction is linear in the
  definition; nothing fixed per machine is recomputed per turn.

## 3. Problem classes

| Family                                                          | Members                                                                                                                                                                                                       | Handling                                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. A fact with two sources                                      | body-only schedule names, keys, reasons (CS 3.4 items 1 to 3); `restartOn` as `unknown`; 42 annotated mappers, 32 hand-typed parameters, about 20 restated types; `Timers`, `ScheduleKey`, two metadata types | **Removed:** a fact read outside the body is declared on the definition; every reader type is a `derive.ts` row; no second declaration site exists (5.1, 5.2)                     |
| B. The body is checked and dropped                              | excess keys compile (`excess-keys.test-d.ts:69,93,99,104`); `gaurd`, `pausd`; rule names unreachable                                                                                                          | **Removed:** `B & Exact<B, MachineBody<D>>`; an unknown key has type `never` (5.3)                                                                                                |
| C. An erased type restored in many places                       | 17 erasure casts in 9 files (CS 3.3a); 38 disables at HEAD                                                                                                                                                    | **One point each:** three crossings, `door`, `slot`, `project` (5.7); not removed, since each is a cast                                                                           |
| D. Wide where Flow holds the name                               | `pausedBy: string[]`, `owed[].reason`, evidence names as `string`, `rules` as text                                                                                                                            | **One point:** public types are assembled only in `derive.ts`; a lint row refuses a wide name in an exported signature (9.3). Members not yet rows are debt (H6)                  |
| E. A construction failure is a throw                            | SC-1; first finding only (`error.ts:124`); body throw; the other machines of the module lost; 5 walks to refuse                                                                                               | **One point:** authoring doors return a value, `Built`, `Refused` or `Blocked`; only `compiledOf` raises for a finding (5.9, Q1). Not removal: a signature cannot forbid a throw  |
| F. One reason, two severities or two homes                      | SC-4: `UnhandledEvent` (`machine.ts:225` against SC:196), `DelayOutOfRange`                                                                                                                                   | **Removed:** reasons are the keys of one table, each row one severity and one stage; a finding stores no severity (7.3, 5.10)                                                     |
| G. A host fact inside construction                              | SC-3 `enabled: import.meta.env.DEV`; positions from a stack (SC Ask 5 trace B)                                                                                                                                | `enabled` and positions **removed:** a rule has no such field and `Compiled` no position type (Q5, Q7). A body that reads the environment anyway: **one point**, a lint row (9.3) |
| H. Fixed per machine, recomputed per call or per walk           | sweep F2 (5 rows) and F4 (9 rows)                                                                                                                                                                             | **One point:** `indexOf`, one pass, the only writer of `Compiled`'s derived fields (section 10)                                                                                   |
| I. A type test that cannot fail, or passes for the wrong reason | one-sided refusals, `today` pins (`schedules.test-d.ts:58,297`), recorded limits never re-run                                                                                                                 | **One point:** the patch set of 9.2, each two-sided, each pin named with the row that flips it; `paired-refusals` stays at 0                                                      |

## 4. Model

No state here changes at run time. The states are values made once at module load.

| State                       | Type                                                                     | Owner and writer              | Readers                                        | Saved                                   |
| --------------------------- | ------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------- | --------------------------------------- |
| a definition                | made value: tokens and `findings`                                        | `definition()`                | `machine()`, context reads, `derive.ts`        | no                                      |
| a contract                  | made value: `Bound` and `findings`                                       | `transaction()`, `resource()` | `definition()`                                 | no                                      |
| a machine's construction    | `Built { compiled, warnings }`, `Refused { findings, cause }`, `Blocked` | `machine()`                   | `findingsOf`, `compiledOf`                     | no                                      |
| `Compiled`                  | immutable data and Slots                                                 | `compile`                     | the core, `project`, the CLI                   | no (AR stamps records with its `shape`) |
| `Compiled`'s derived fields | section 10                                                               | `indexOf`                     | the core's hot paths                           | no                                      |
| the body's type `B`         | type level only                                                          | `machine()`'s signature       | `RuleNames<B>`                                 | no                                      |
| a finding                   | 5.10                                                                     | the table of 7.3              | `flow check`, the `FlowError` of a refused use | no                                      |

Inputs of each user callback this cluster adds:

| Callback               | Inputs                                                                    | Never                              |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| the body function      | `{ S, E, O, C, turn }`, tokens only                                       | memory, the clock, the environment |
| an invariant's `check` | `{ state, memory, context }` of one publication (AT's `Published`)        | the event, the clock               |
| a turns rule's `check` | `{ event, before, after }` from AT's `Turn` (SC-2), `event` typed by `on` | the clock; operations in flight    |

## 5. Types

### 5.1 One derivation

`src/derive.ts` (new, types only) is the only module that turns a declaration into a public type. `Parts<D>`
moves there and gains one field per declared part; every public type is one of its rows. A new feature adds a
declared part to `Definition`, a field to `Parts`, and rows; it never adds a type parameter to `Machine`,
`ActorRef`, `Actor` or `Snapshot` (TM 3.2, kept). `Machine`'s one extra parameter, `R`, is for what only the body
authors (5.3).

| Fact                                     | Source (one)                                        | Reader types, all in `derive.ts`                                                                | Status                      |
| ---------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| leaf states, paths                       | `D["states"]`                                       | `Snapshot.state`, `S` tokens, `in:` of a rule, terminals                                        | today                       |
| event payload                            | `D["events"]`, `D["internalEvents"]`                | handler `event`, `E.X(...)`, `E.X.Type`, a turns rule's `event`                                 | compiled (`f3`, `f1`)       |
| memory                                   | `D["memory"]`                                       | every callback's `memory`, `Snapshot.memory` by `View`, `D.M.x.Type`                            | compiled (`f3`)             |
| operation names, rows                    | `D["operations"]`                                   | `Snapshot.operations`, `O` handles                                                              | today                       |
| a mapper's `value`, `{ input, key }`     | the contract's `commit` or `lookup`, `input`, `key` | `E.X.from((value, { input, key }) => ...)`                                                      | compiled (`c-mapper`)       |
| schedule name, key, reasons, selection   | `D["schedules"]`                                    | 5.2                                                                                             | compiled (`e-declared`)     |
| rule names                               | the body, through `B`                               | `Machine<D, R>["rules"]`, the verdict's `RuleBroken.rule` (5b)                                  | compiled (`f1`, `f2`)       |
| context slot values                      | `D["context"]`                                      | callbacks' `context`, `Snapshot.context`, `C.slot.change`                                       | today                       |
| props, emits, fragment memory, slot rows | AT section 10's declared parts                      | `Reads<D, Scope, View>`, `Snapshot.props`, `onEmit`, slot rows                                  | designed, not compiled (H3) |
| evidence names                           | the rows above                                      | `EvidenceOf<D>`: each `state`, `event`, `operation`, `schedule` field a union (5b fills fields) | designed, not compiled (H3) |

`Reads<D, Scope, View>` is AT's one callback-input type: `{ memory, context, props, key, item, operations }`
picked by `View`; the six literals in `tokens.ts` become picks of it. Its schedule instance is 5.2's
`ScheduleInput`.

### 5.2 Declared schedules (problem 19: TM-1, TM-2, TM-4)

```ts
// src/tokens.ts. NEW: ScheduleDecl, ScheduleDecls, KeyOfDecl, ReasonOfDecl, SelOfDecl, ScheduleBodyOf
// existing: ScheduleInput, ScheduleMetadata, ScheduleEvent, ScheduleOperations, AnySchedule, Ending, Entry
export type ScheduleDecl = {
  readonly key?: Schema.Struct.Fields;             // a field record, as an event's fields are
  readonly pausedBy?: ReadonlyArray<string>;
  readonly restartOn?: Schema.Top;                 // AS Q1, answered
};
export type ScheduleDecls = Readonly<Record<string, ScheduleDecl>>;
export type KeyOfDecl<Dc> = Dc extends { readonly key: infer F extends Schema.Struct.Fields }
  ? Schema.Struct<F>["Type"] : undefined;
export type ReasonOfDecl<Dc> = Dc extends { readonly pausedBy: ReadonlyArray<infer R extends string> } ? R : never;
export type SelOfDecl<Dc> = Dc extends { readonly restartOn: infer S extends Schema.Top } ? S["Type"] : never;

type In<M, Cx, Dc> = Omit<ScheduleInput<M, Cx, KeyOfDecl<Dc>>, "now">;
export type ScheduleBodyOf<M, Ev, Id extends string, Cx, Dc> = {
  readonly schedule: Duration.Input | AnySchedule
    | ((input: ScheduleInput<M, Cx, KeyOfDecl<Dc>>) => Duration.Input | AnySchedule);
  readonly send: ({ readonly tag: keyof Ev & string } | { readonly ending: { readonly event: keyof Ev & string } })
    & Ending<Omit<ScheduleMetadata, "name" | "key"> & { readonly key: KeyOfDecl<Dc> }, Id>;
  readonly armOn?: ReadonlyArray<ScheduleEvent<Ev, Id> | Entry>;
  readonly disarmOn?: ReadonlyArray<ScheduleEvent<Ev, Id>>;
} & ([KeyOfDecl<Dc>] extends [undefined] ? { readonly keys?: never }
    : { readonly keys: (input: { readonly memory: M; readonly operations: ScheduleOperations })
        => ReadonlyArray<KeyOfDecl<Dc>> })
  & ([SelOfDecl<Dc>] extends [never] ? { readonly restartOn?: never }
    : { readonly restartOn: (input: In<M, Cx, Dc>) => SelOfDecl<Dc> })
  & ([ReasonOfDecl<Dc>] extends [never] ? { readonly paused?: never }
    : { readonly paused: { readonly [P in ReasonOfDecl<Dc>]:
        (input: In<M, Cx, Dc> & { readonly operations: ScheduleOperations }) => boolean } });

// src/definition.ts: Definition gains its eighth parameter `Sch extends ScheduleDecls` and `readonly schedules: Sch`;
// definition() infers `const Sch`, so `pausedBy: ["LidOpen"]` is a literal with no `as const`.
// src/derive.ts: Parts<D> gains `Sch`; a state's `schedules` is { readonly [N in keyof Sch]?: ScheduleBody<D, N> }.

// src/host/snapshot.ts. CHANGED: TimerView takes its reasons. NEW: TimersOf.
export type TimerView<R extends string = string> =
  | { readonly dueAt: number } | { readonly left: number; readonly pausedBy: ReadonlyArray<R> };
export type TimersOf<D extends AnyDefinition> = {
  readonly [N in keyof D["schedules"]]?: [KeyOfDecl<D["schedules"][N]>] extends [undefined]
    ? TimerView<ReasonOfDecl<D["schedules"][N]>>
    : ReadonlyArray<{ readonly key: KeyOfDecl<D["schedules"][N]> } & TimerView<ReasonOfDecl<D["schedules"][N]>>>;
};
```

Compiled on the real package with 13 refusals and exact positive assertions (`e-declared.ts`, 0 errors in the
file): `key` is the declared record in `schedule`, `restartOn`, each reason and the send mapper, and `undefined`
in an unkeyed schedule (`key.slot` there is an error, which turns the pin at `schedules.test-d.ts:58`); `keys` is
required when keyed and refused otherwise; a misspelt, missing or undeclared reason, a `restartOn` of the wrong
type or with none declared, an undeclared schedule name and an excess key (`pausd`) are each refused, at nesting
depth 2 as well; `Snapshot<typeof D>["schedules"]` equals `TimersOf<D>` (turns the pin at `:297`). The comment at
`tokens.ts:298-300` ("the mapper's call is resolved before `K` is inferred") stops being true: `K` is no longer
inferred. No TypeScript limit was hit. `Flow.keyed`, `KeyedConfig`, `KeyedSchedule`, `ScheduleKey` and the
`"~flow": "keyed"` wrapper are deleted.

Rules that settle TM-4:

- A body schedule must be declared (a type error and a construction finding, `ScheduleUndeclared`).
- A declared name may be placed in several states; all placements share the name, key, reasons and selection
  type. AS decides what an active placement inherits; nothing here changes its tables.
- A declared schedule placed nowhere is the warning `ScheduleUnplaced`.
- Every declared reason has its callback in every placement (Q4).
- **Twin rule.** Every refusal the types make has a construction row of the same meaning, for a body that
  reaches `machine()` through a cast or plain JavaScript: `ScheduleUndeclared`, `ReasonUndeclared`,
  `ReasonMissing`, `KeysMissing`, `KeysUnexpected`, `RestartOnUndeclared`, `KeyOmitsField`, `RuleNameTwice`. An
  excess key is already refused by the body decode (`config.ts:345`, `onExcessProperty: "error"`). A `restartOn`
  result its Schema refuses is that read's failure at run time (AS).

In `Compiled` (TM-2, AR Q8): `Compiled.schedules: ReadonlyMap<ScheduleName, { key: Option<Codec>, selection:
Option<Codec>, reasons: ReadonlyArray<Reason> }>`, built from the declaration, and each `Node`'s compiled schedule
points at its entry. The restore decodes a saved key and baseline with these codecs, so a key whose Schema
changed is dropped with a report (AR's reference rows), never routed to another timer.

### 5.3 Body capture and the machine's type

```ts
// src/derive.ts. NEW: Exact, ExactBodyOf, RuleNames, RuleToken, the second parameter of Machine.
// existing: MachineBody, BodyTokens
export type ExactBodyOf<D, B> = [D] extends [AnyDefinition]
  ? (tokens: BodyTokens<D>) => B & Exact<B, MachineBody<D>> : never;       // BCS's C6, with its conditional
export type RuleNames<B> = B extends { readonly rules: infer Ru }
  ? (Ru extends { readonly invariants: infer I } ? keyof I & string : never)
    | (Ru extends { readonly turns: infer T } ? keyof T & string : never)
  : never;
export type RuleToken<K extends string = string> = { readonly "~rule": K };
export type Machine<D extends AnyDefinition = AnyDefinition, R extends string = never> = {
  readonly definition: D;
  readonly construction: Construction;                                       // 5.9
  readonly rules: { readonly [K in R]: RuleToken<K> };
};
export declare const machine: <D extends AnyDefinition, const B extends MachineBody<D> = MachineBody<D>>(
  definition: D, body: ExactBodyOf<NoInfer<D>, B>,
) => Machine<D, RuleNames<B>>;
```

- **What `B` gives:** exactness at every depth, and the rule names. Nothing else is read from it. Schedules,
  keys and reasons are declared (5.2), so the snapshot, handles and evidence derive from `D` alone, and an
  annotated `Machine<typeof X>` loses only the rule tokens (R2 Q3).
- **`turn({ on, check })`** (R2 Q2) is handed to the body in its tokens, typed by `D`: `event` is the payload of
  `on`, `before.memory` and `after.memory` the definition's memory. An imported free `turn` also infers (its
  memory comes from the contextual return type); the token form pins memory by `D` and needs no import, so it is
  the one kept.
- **Compiled:** `M.rules.Known` compiles, a misspelt name is an error, no `rules` gives `never` (`f1`).
  `Machine<X, "A">` assigns to `Machine<X>` and to `Machine`, and `infer M extends Machine`
  (`host/setup.ts:23`, SC-5) still matches (`f2`). With the default `never`, `M.rules.Typo` on an annotated
  machine is an error; with `string` it is `RuleToken | undefined` (Q2).
- **Kept limits, each re-run:** `const` is inert behind the conditional (arrays infer as a union, not a tuple);
  an unknown key reads "not assignable to type 'never'"; a hoisted object with an extra key is refused too (BCS).
- **If inference of `B` ever falls back to its default,** `RuleNames<MachineBody<D>>` is `string`, and a
  misspelt rule would compile; no such call was seen, and a type test pins it (9.2).
- **Migration cost seen in the copy:** 41 compile errors in type tests that assert `machine()` returns exactly
  `Machine<typeof X>`, and `fixtures/sync/stories/structure.ts:61`, whose planted wrong body becomes a type error
  and needs `@ts-expect-error`.

### 5.4 Mappers and contracts

```ts
// src/contract.ts. NEW: MapperContext, CoversInput, HandlesTimeout. CHANGED: Ending gains Cx; ErasedEnding.
export type MapperContext<I, K> = { readonly input: I; readonly key: K };
// Ending: `from` becomes (value: V, context: Cx) => Values; its other fields are unchanged.
export type Ending<V = unknown, Id extends string = string, Cx = unknown> = EndingFields<V, Id, Cx>;
export type ErasedEnding = Ending<never, string, never>;
export type CoversInput<F extends Fields, Key extends ReadonlyArray<string>> =
  [Exclude<keyof StructType<F>, Key[number]>] extends [never] ? unknown : { readonly key: never };
export type HandlesTimeout<E> =
  [Extract<E, { readonly _tag: "TimeoutError" }>] extends [never] ? unknown : { readonly commit: never };
// src/event-tokens.ts. CHANGED: `from` takes (value: V, context: Cx); MappedEvent gains Cx. NEW: `readonly Type: P`.
```

- **AO's mapper proof holds:** with no annotation, `value` is the commit's success or the tagged failure,
  `input` the contract's input and `key` its key record, keyed and unkeyed (`c-mapper.ts`). `V` is found by
  return-type inference from the ending's slot. An empty key is `{}`, not `never`. Today a second mapper
  parameter is a compile error (`TS2345`), so the user's decided shape is not yet expressible.
- **A schedule's `send` keeps one argument**, the firing's metadata (TM-3, Q10): a firing has no `input`.
- **`resource` keys:** a key that omits an input field, optional ones included, is an error on `key`; a
  `transaction` may keep a partial key; no fixture `resource` is newly refused (`f4`, `g2-covers.ts`). This needs
  `KeyFields<F>` widened from required keys to `keyof StructType<F>`: with today's `KeyFields` an input with an
  optional field could never have a resource. The widening also lets a `transaction` name an optional field.
- **`TimeoutError`:** an unhandled timeout in a `transaction`'s `commit` is an error on `commit` (`f5`). The
  match is by tag: `Extract<E, Cause.TimeoutError>` matched fixture errors structurally and refused correct
  commits.
- **`Bound<"read">` has no `concurrency`:** designed, not compiled (H2).
- **`E.X.Type` and `D.M.x.Type`** are the payload and the field type (R2 Q13); the token stays callable (`f3`).

### 5.5 The schedule metadata's `output` (RT6): kept `unknown`

Two shapes were compiled and both fail (`f8`): a per-entry helper leaves `from`'s `V` with no inference source
(`output: never`), and a check against the captured `B` gives `unknown`, because a callback's parameter cannot
be typed from a sibling property through a mapped type of `B`. `output` stays `unknown`, a stated boundary. No
fixture mapper reads it (`home/machines/room.ts:132,162,183` read `key`, `firedAt` and `attempt`). Q11.

### 5.6 `Compiled` is not generic in `D`

The core runs every machine of a world through one `Map<MachineId, Compiled>`. A `Compiled<D>` there would be
instantiated at `AnyDefinition` in every core signature: TypeScript has no existential type, so the parameter
would buy nothing inside the core and cost instantiations on every function. The design keeps one erased
`Compiled`, makes it precise where that is free, and puts the typed face on `Machine<D, R>`:

- **Branded names**, each made only by a decode built from `Compiled` or by the mint (AR section 10):
  `MachineId`, `StateName`, `EventTag`, `OperationName`, `ScheduleName`, `Reason`, `SlotName`, `RuleName`.
  `state: string` and `operation: string` in `compiled.ts`, `world.ts` and `evidence.ts` become these.
- **`Slot<I, O>`** keeps its erased input honest: `run: (input: never) => O`. A typed callback assigns to it
  with no cast, and only `slot` (5.7) may call it.
- **`AnyBody`** becomes a true supertype of every `MachineBody<D>`: its callbacks take `never`. A body then
  assigns to it with no cast, inside a generic function too (`f6`, `g3-anybody.ts`: rule checks and schedule
  `keys`, `restartOn` and reasons at `never`; `states` and `schedules` must be `Partial` records under
  `exactOptionalPropertyTypes`; `on` handlers were not confirmed at `never`, H2).
- **New fields:** `schedules` (5.2), `rules`, `saved` (AR's seven codec groups, granted) and the derived fields
  of section 10.

### 5.7 The three crossings

| Crossing  | Direction                                      | The one function                                           | What justifies its cast                                                             | Absorbs (the first site is the kept one)                                     |
| --------- | ---------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `door`    | public signature onto an erased implementation | `entry.ts#door<Public>(name, args, run)` (AO 6.9)          | `run` is written on erased types only; the public type is a `derive.ts` declaration | `entry.ts:45`, `machine.ts:167`, `flow.ts:318`, `events.ts:20,26`            |
| `slot`    | typed callback into the erased core            | `handles.ts#slot(name, run)`, the only caller of a `Slot`  | the input was built by `Compiled`'s own codecs for that callback's position         | `handles.ts:29`, `machine.ts:131`, `contract.ts:255`, `compiled-parts.ts:22` |
| `project` | erased state out to the typed reader           | `host/snapshot.ts#project<D, View>(machine, erased, view)` | the actor is of `Machine<D>`; its memory passed `Compiled.memory` at every write    | `host/snapshot.ts:244`; the test tooling's own restores (5b)                 |

- Inside a door the erased value comes from a decode, never a cast: `machine()`'s body decode
  (`config.ts#bodyFindings`) already runs and its result is thrown away; it now returns the `AnyBody`. That
  removes `machine.ts:125,172`, `compile-body.ts:196`, `compile-schedules.ts:241` and `flow.ts:251`, and one of
  the two body walks.
- A door cannot be written without its one cast: the erased implementation assigns to the public signature in
  its parameters and fails only on the return type (`f7`, "`AnyDefinition` is not assignable to type `D`").
- Evidence leaves through the same `project` rule: a Story reads typed evidence only through one function per
  carrier that takes the `Machine<D>`; 5b names it.
- The three crossings carry a definition's types. A contract's services have a fourth, `driver.ts#provided`
  (the boot provides them; `run-promise.ts:50` calls it instead of casting again). The other kept casts are not
  crossings but boundaries to something outside Flow's types: the mint, `tx.ts#draft`, the JSON entry and
  Effect's Schema AST (section 11).
- A count cannot tell a wrong cast from a right one. What justifies `slot` and `project` is I3: each typed
  reader has a run that reads the same value.

### 5.8 What each earlier cluster asked for

| Requirement                                                                   | Answer                                                                                                                                         |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AS RT1, RT2, RT3, RT7                                                         | 5.2, compiled                                                                                                                                  |
| AS RT4 (one typed point of erasure, carrying the codecs)                      | `slot` and `Compiled.schedules`; the `Schedule<Key, Why>` generic is not needed (5.6); designed                                                |
| AS RT5 (issue source and evidence typed by declared names)                    | `EvidenceOf<D>` rows; designed, not compiled (H3)                                                                                              |
| AS RT6                                                                        | 5.5: kept `unknown`, two shapes failed                                                                                                         |
| AS indexes `schedulesAt`, `byName`, `rank`, `armedBy`, `disarmedBy`           | section 10                                                                                                                                     |
| AT section 10 rows; `Compiled.slots`, `fragments`, `emits`, `props`           | `Parts` rows and `Compiled` fields by the 5.1 rule; designed, not compiled: no code exists (H3)                                                |
| AT indexes `chain`, `depth`, `fieldsByName`, private set, `slotsAt`, `listOf` | section 10                                                                                                                                     |
| AT H5 (a view addressing a fragment's public event)                           | handed to 5b with the type rule: the address is a `derive.ts` row of the fragment's declaration (H3)                                           |
| AT H6 (the public face of `Published.incarnation` and `Turn`)                 | `EvidenceOf<D>`; a turns rule's input is its typed pick (section 4); fields are 5b's                                                           |
| AR `Compiled.saved`, Q8                                                       | granted (5.6); the departure from TM:285 is Q8 here                                                                                            |
| AR `RefRows` and the step table total                                         | a mapped type over a literal union is total: a missing or extra key is an error (`f9`). `RefMapsOf` over the real shapes was not compiled (H4) |
| AR brands, one constructor each                                               | 5.6                                                                                                                                            |
| AO mapper proof                                                               | 5.4, compiled                                                                                                                                  |
| AO `resource` key, `TimeoutError`, `Bound<"read">`                            | 5.4: two compiled, one designed                                                                                                                |
| AO door types from `derive.ts`; the `throw` lint (ET-4)                       | 5.7; the lint row is 9.3                                                                                                                       |
| AO `trusted` casts (`contract.ts:246,255`)                                    | `:246` removed by `intake` (AO); `:255` is a call through `slot`                                                                               |

### 5.9 Construction is a value (problem 17)

```ts
// src/derive.ts. NEW: Construction
export type Construction = Data.TaggedEnum<{
  Built: { readonly compiled: Compiled; readonly warnings: ReadonlyArray<Finding> };
  Refused: { readonly findings: NonEmptyReadonlyArray<Finding>; readonly cause: Option.Option<unknown> };
  Blocked: {};                        // its definition or a contract has an error finding; the body never ran
}>;
```

`Refused.findings` are the machine's own, at least one an error; `cause` is what a throwing body threw. A
definition and a contract keep their tokens and store their own `findings` (empty when clean). No authoring
constructor (`definition`, `transaction`, `resource`, `machine`, `app`, `runtimeSetup`, `Story.app`) raises for
a finding; each still raises for an argument of the wrong kind, since no tokens can be made from it. Findings are
stored once, where they arise; an app's are derived: `findingsOf(app)` (7.2). `compiledOf(app)` is the only
function that turns an app into something runnable, and the only one that raises for findings.

### 5.10 A finding

```ts
// src/error.ts. CHANGED: Finding. NEW: reason as a key of CHECKS, severity, machine, location.
// existing: path, summary, help, details
export type Finding = {
  readonly reason: Reason;                       // keyof typeof CHECKS (7.3); severity is CHECKS[reason].severity
  readonly owner: Owner;                         // { kind: "contract" | "definition" | "machine"; id }: where it arose
  readonly path: ReadonlyArray<string | number>; // the path inside the owner, always
  readonly location: Option.Option<Location>;    // { file: string; export: string; line: Option<number> }
  readonly summary: string; readonly help: string; readonly details: Values;
};
```

A finding stores no severity and no stage: both are read from its reason's row, so they cannot disagree.
`location` is always `none` in the core. Only the CLI's source adapter fills it (Q7).

## 6. Operations

| Operation                        | Signature                                                         | Notes                                                                      |
| -------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `definition(config)`             | `Definition<..., Sch>`                                            | never raises for a finding                                                 |
| `machine(definition, body)`      | `Machine<D, RuleNames<B>>`                                        | 7.1                                                                        |
| `compile(definition, written)`   | `Result<{ compiled, warnings }, NonEmptyReadonlyArray<Finding>>`  | pure; `written` is what the body returned; one decode, one walk, `indexOf` |
| `indexOf(parts)`                 | the derived fields of section 10                                  | the only writer of them                                                    |
| `findingsOf(app)`                | `ReadonlyArray<Finding>`                                          | 7.2's order; each owner once                                               |
| `compiledOf(app)`                | `CompiledApp`, or raises one `FlowError` with every error finding | called when a Runtime starts and when a Story runs                         |
| `project(machine, erased, view)` | `Snapshot<D, View>`                                               | the one outward restore                                                    |
| `flow check`                     | `Effect<Result, InvocationFailure, Env>` (SC 3.3)                 | 7.2                                                                        |

## 7. Rules

### 7.1 A machine's construction

| Body function  | Definition and contracts | Body result                                  | Machine                                          | Body runs |
| -------------- | ------------------------ | -------------------------------------------- | ------------------------------------------------ | --------- |
| not a function | any                      | n/a                                          | raises `WrongKind` (a module that does not load) | 0         |
| a function     | an error finding         | n/a                                          | `Blocked`                                        | 0         |
| a function     | no error finding         | throws                                       | `Refused`, one `Defect` finding, the cause kept  | 1         |
| a function     | no error finding         | returns; a construction row with an error    | `Refused`, every construction finding            | 1         |
| a function     | no error finding         | returns; construction warnings only, or none | `Built`, with those warnings                     | 1         |

`Blocked` exists because a body run against a refused definition's tokens would throw for reasons that are not
the body's. A definition or contract with only warnings does not block. The first row is the only raise, and it
is checked first.

### 7.2 Loading for the CLI and for a run

| Config import   | Machines of the app         | `flow check`                                                                                                                 | Starting a Runtime, running a Story                          |
| --------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| loads           | all `Built`, no error row   | findings (warnings, info), exit 0                                                                                            | runs                                                         |
| loads           | all `Built`, an error row   | findings, exit 1                                                                                                             | runs (a graph error does not stop a run)                     |
| loads           | some `Refused` or `Blocked` | every machine's findings; graph rows only for `Built` ones; exit 1                                                           | `compiledOf` raises one `FlowError`, exit 2 as `RunRejected` |
| throws anything | unknown                     | `ConfigLoadFailed`, stderr, exit 2; when the throw is a `FlowError` (a wrong-kind argument), all its diagnostics are printed | the same                                                     |

`findingsOf(app)` visits owners in this order and each owner once, at its first visit: for each machine in key
order, its contracts in declaration order, its definition, then the machine itself (`Refused.findings` or
`Built.warnings`), then, when `Built`, its graph rows. Within an owner: by path, then reason. `Blocked` has no
finding of its own; its definition's or contract's error is in the list under that owner. A graph error
(`TerminalLeft`) fails `flow check` and does not stop a run: only construction errors do.

### 7.3 One table of reasons

```ts
// src/core/checks.ts. NEW: CHECKS, Reason, Stage. A reason is a key, so it has one row.
export const CHECKS = {
  DelayOutOfRange:      { severity: "error",   stage: "construction" },
  ScheduleUndeclared:   { severity: "error",   stage: "construction" },  // and the other twins of 5.2
  RuleNameTwice:        { severity: "error",   stage: "construction" },  // one name, an invariant and a turns rule
  ReactionUnhandled:    { severity: "error",   stage: "construction" },  // today `UnhandledEvent` at machine.ts:225
  ScheduleUnplaced:     { severity: "warning", stage: "graph" },
  UnhandledEvent:       { severity: "warning", stage: "graph" },
  StateUnreachable:     { severity: "warning", stage: "graph" },
  LikelyStuck:          { severity: "warning", stage: "graph" },
  RuleSubjectUnreachable: { severity: "warning", stage: "graph" },
  TerminalLeft:         { severity: "error",   stage: "graph" },
  // ... every other reason: today's codes (`Defect`, the decode's, each `InvalidConfiguration` reason),
  // then each owner Task's rows
} as const satisfies Readonly<Record<string, { severity: Severity; stage: Stage }>>;
export type Reason = keyof typeof CHECKS;
```

- A `construction` row with severity `error` is what makes a machine `Refused`; a `graph` row never does.
- `UnhandledEvent` as a graph row means: a declared event that no state and no root handler names.
  `handledTags` is machine-wide, as `machine.ts:176` is today.
- SC-4: the reaction finding is renamed `ReactionUnhandled`, so `UnhandledEvent` has one meaning and one
  severity; `DelayOutOfRange` is a construction row only, and SC:196's check row is dropped.
- Terminals are proved by `flow check` over SC's edge graph and judged nowhere else; the finding is
  `TerminalLeft` (SC Ask 1, Q6).
- SC's guard stays: every row has a fixture that triggers it, a near fixture that does not, and a planted fault.

## 8. Algorithm

```
machine(definition, body):                       # door; erased inside
  if body is not a function: raise WrongKind
  if definition or one of its contracts has a finding whose row is an error: return made(Blocked)
  written = try body(tokensOf(definition))       # tokens: S, E, O, C, turn
  if threw: return made(Refused { findings: [Defect at ["body"]], cause })
  return match compile(definition, written):
    failure fs         -> made(Refused { findings: fs, cause: none })
    success (c, warns) -> made(Built { compiled: c, warnings: warns })

compile(definition, written):                    # pure, no host API
  body  = decode(BodySchema(definition), written)        # the one walk that types the body as AnyBody; all issues
  tree  = definition.tree                                 # built once in definition(); nodes with chain and depth
  parts = walk(tree, body):                               # one pre-order walk, an accumulator, no spreads
            per node: handlers (by Map lookup of the node's children), schedules through slot(...),
            add each handled tag to handledTags, each rule to rules
  fs    = construction rows of CHECKS over (definition, parts)       # one pass each; reads handledTags
  if any row of fs is an error: return failure(fs)                # all of them, warnings included
  return success(freeze({ ...parts, schedules, saved, ...indexOf(parts) }), fs)   # fs holds warnings only

findingsOf(app):
  seen = {}
  for machine in app, in key order:
    for owner in contracts of its definition, then its definition: if owner not in seen: add; yield findings(owner)
    yield Refused.findings | Built.warnings | nothing when Blocked
    if Built: yield graph rows of CHECKS over edgesOf(compiled)     # SC 3.1, computed per command, not stored
```

## 9. Invariants and checks

### 9.1 Invariants

- **I1. One source.** Every exported type that mentions a name, payload, key or reason of a definition is an
  instantiation of a `derive.ts` type. [P1, P2]
- **I2. Exact body.** A body with a key its definition's shape lacks does not compile, at every depth and in
  every union member. [P2]
- **I3. Delivered as typed.** For each row of 5.1, the value the runtime delivers at that reader has the row's
  type: a type test and a Story read the same reader. [P3]
- **I4. Named crossings.** The cast disables in `src/` outside test tooling are exactly: `door`, `slot`,
  `project`, `provided`; the mint, `tx.ts#draft` and `codec.ts`'s JSON entry; the seven in `core/boundary.ts`.
  `refs.ts:60` joins the list or goes once H2 is run. [P3]
- **I5. Total construction.** No authoring constructor raises for a finding. [P4]
- **I6. Nothing hidden.** `findingsOf(app)` holds every finding of every owner exactly once, warnings included,
  whatever the state of the other machines. For a `Refused` machine one is its own error; for a `Blocked` one, an
  error of its definition or of a contract. [P4, P5]
- **I7. Never runs.** `compiledOf(app)` raises when any machine is not `Built`; no `Compiled` exists for a
  machine with an error construction row; a `Blocked` machine's body ran zero times. [P4]
- **I8. One row per reason.** A reason has one severity and one stage, and a finding has no other source for
  either. [P4]
- **I9. Pure compile.** `compile` reads only its two arguments; two compiles of one source are equal by
  `dataView` (which shows a Slot by its name); no type reachable from `Compiled` holds a file position. [P6]
- **I10. Derived fields are derived.** Every field of section 10 equals its defining scan over `Compiled`'s
  facts. [P7]
- **I11. Codecs come from the declaration.** Each leaf of `Compiled.saved` and of `Compiled.schedules` is the
  codec of the declaration that types its readers in 5.1. [P3]
- **I12. A machine's type widens.** `Machine<D, R>` assigns to `Machine<D>` and to `Machine`. [P1]

### 9.2 Checks

- **Type patches (I1, I2, I3, I12).** Each is a planted change to a type that must turn a named two-sided test
  red: `ExactBodyOf` without `Exact`; `KeyOfDecl` returning `Values`; `ReasonOfDecl` returning `string`;
  `SelOfDecl` returning `unknown`; `keys` optional when keyed; `TimersOf` replaced by `Timers`; `RuleNames`
  returning `string`; `Machine`'s `R` invariant; `MapperContext` as `unknown`; `CoversInput` and
  `HandlesTimeout` as `unknown`; `.Type` as `unknown`; a turns rule's `event` as `Values`. 13 patches, each
  against the toaster of section 1 and, once migrated, two fixtures (`home/Room`, `shop/Cart`), at depths 1 to
  3. Also pinned: a state, event and memory typo (the rows marked "today"), and `R` when `B` takes its default.
- **Delivered as typed (I3, I11).** Each two-sided type test has a Story that reads the same reader at run time:
  an unkeyed mapper's `key` is `undefined`; a snapshot's timers have exactly `TimersOf`'s keys; a value encoded
  by the declaration's Schema decodes through `Compiled.schedules`' codec to an equal value, per fixture.
- **Surface (I1).** `tests/types/public.test-d.ts` walks every export; a type that names a definition's part
  without going through `derive.ts` fails it. Family D's debt (H6) is its starting red list.
- **Construction, exhaustive (I5 to I8).** Alphabet: definition {clean, finding} x contract {clean, finding} x
  body {clean, warning only, error finding, two error findings, throws, not a function} x a second machine
  {clean, error finding} x use {`flow check`, run}: 96 cells, with the definition's and contract's "finding"
  taken once as an error and once as a warning in a 16-cell slice. The oracle is 7.1 and 7.2 read row by row; it
  checks the exit, that every owner's findings are present exactly once, the count of findings, and that the
  body ran exactly the number of times 7.1 gives. Seven more cells give each authoring constructor an argument
  with a finding and require no raise. One test asserts every `Finding`'s severity is read from `CHECKS`.
- **Index (I10).** For every fixture machine, recompute each derived field by its slow scan and compare. The
  scans (`chainOf`, `leafOf`, the filters section 10.3 replaces) move into this test as the reference. `rank` is
  the schedule's position in the definition's `schedules`; `shape`, `slotsAt` and `listOf` take their defining
  scans from AR and AT.
- **Purity (I9).** Compile each fixture twice, once under a stubbed clock and a second module instance; compare
  by `dataView`. A lint row bans `Date`, `Math.random`, `import.meta`, `process` and `Error().stack` in every
  file `compile` reaches, and a type test asserts `Location` is not reachable from `Compiled`.
- **Crossings (I4).** A test compares the cast disables, by file and function, with I4's list; a new one fails
  it.

### 9.3 Lint rows (one point each, `tools/flow-state-lint/`)

- `no-hand-typed-callback`: an annotation on a parameter that a Flow position already types (T113's guard).
- `no-wide-public-name`: `string`, `Values` or `unknown` where an exported signature carries a declared name or
  a payload, outside `FLOW_STATE_ALLOW_UNKNOWN`.
- `no-throw-in-user-callback` (ET-4): a `throw` statement lexically inside a body, mapper, guard or rule.
- `no-host-read-in-body`: `import.meta`, `process`, `Date` or `Math.random` lexically inside a machine body or a
  definition config (P6 for user code; SC-3's trace).
- `paired-refusals` stays; `no-mark-probe` goes with the marks (AO 6.9).

### 9.4 The Story of the wrong ending, and planted faults

A room's poll is paused by `Vacation`. Its author writes `paused: { Vacaton: ... }` and a view reads
`pausedBy.includes("Vacation")`. Today both compile: the reason never holds, the timer fires while the house is
empty, and the view never shows the pause. Wrong ending: the thermostat is set during a vacation and no check
was red. Here neither line compiles.

Second: an app has two machines; one has a negative delay, the other an unreachable state. Today `flow check`
(as Q11 describes it) can show at most the first throw. Wrong ending: the second problem ships. Here both rows
print and the exit is 1.

Planted faults: `machine-throws-on-finding`, `first-finding-only`, `blocked-runs-body`, `refused-compiles`,
`reason-two-severities`, `index-chain-stale`, `index-armedby-missing-root`, `compile-reads-clock`,
`project-second-cast`, `key-codec-from-body`, `rule-name-widened`, `location-in-compiled`,
`warning-blocks-machine`, `construction-warning-dropped`, `shared-definition-reported-twice`. Graph rows get
their faults from SC's per-row guard (7.3).

## 10. Cost

### 10.1 Type checking (measured on a copy of the real package, `tsc` 7.0.2, full project of 1028 files)

| Build                     | Check time | Instantiations | Types  |
| ------------------------- | ---------- | -------------- | ------ |
| today                     | 0.77 s     | 4.47 M         | 836 k  |
| body capture (C6)         | 0.95 s     | 5.89 M         | 1.04 M |
| C6 and the mapper context | 1.01 s     | 5.97 M         | 1.05 M |

- C6 costs about 23% check time and 32% instantiations here (BCS measured 28%). It is nearly all of the cost.
- Rule names, `turn`, `.Type`, the two contract checks: 0.614 s against 0.602 s on the same smaller project
  (src, fixtures, spikes), 3.85 M against 3.83 M instantiations: about 2%.
- Declared schedules: not measurable in this run. The copy's fixtures still use `Flow.keyed` and fail (46
  errors), which skips their checking, so its 0.95 s and 5.73 M are a floor, not a figure (H5).
- Measured total without declared schedules: 31% (0.77 s to 1.01 s). Expected with them: 30 to 40%, to be
  measured after the fixture migration (H5); no check here times anything, so the build records it per step. Not
  measured: editor latency, the emitted declaration size with `R`, the docs build.

### 10.2 Construction (by reading; no bench covers it, so the build adds `construct.small`, `.wide`, `.deep`)

Sizes: `N` states, `d` depth, `c` children of a compound, `K` body keys of a compound, `H` handler alternatives,
`S` schedules, `R` reactions, `F` fields, `O` operations.

| Step                      | Today                                                                                           | After                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| body decode and compile   | two walks of the body (`config.ts:340`, `compile-body.ts:306`)                                  | one decode whose result the compile walks                           |
| state tree                | built in `definition()` and again at `machine.ts:329`; `tokenMaps` re-splits every path, O(N·d) | built once, with `chain` and `depth`                                |
| `nodesOf` result          | `[...self, ...below]` per level, O(N·d) copies                                                  | one accumulator, O(N)                                               |
| `childNodes`, `defaultOf` | `K × c` and `c` scans per compound                                                              | Map lookups, O(K)                                                   |
| reaction check `handled`  | O(R·N)                                                                                          | `handledTags` set, O(R)                                             |
| schedule arming check     | O(armOn × disarmOn) per schedule                                                                | a set, O(armOn + disarmOn)                                          |
| key field check           | `toType` per operation, `includes` per key                                                      | the contract's field set, built in its door                         |
| `codecsOf`                | per binding (`contract.ts:357,422`)                                                             | once, in the contract's door                                        |
| a field's JSON form       | about four times per Schema (`fieldOf`, `memoryCodec`, `:383`, `:397`)                          | once per field; the struct forms built from them (H5: not measured) |
| whole construction        | O(N·d + N·c + R·N + S·a²)                                                                       | O(N + H + S + R + F + O)                                            |

### 10.3 Fields `indexOf` writes, each read instead of a scan

| Field                                                | Replaces (sweep F2, and each cluster's ask)                                  | Reader                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| `Node.chain`, `Node.depth`                           | `tree.ts#chainOf`: 20 occurrences, 8 inside `tree.ts`, O(d²) allocation each | AT's `levelsOf`, moves         |
| `Node.leaf`                                          | `tree.ts#leafOf` walking defaults                                            | entry, restore                 |
| `Node.declared` (the schedules of its chain)         | `schedule-plan.ts:44` `declaredOn` per pass                                  | AS's `schedulesAt`             |
| `Node.armedBy`, `Node.disarmedBy` (tag to schedules) | scans of `armOn` and `disarmOn` per turn                                     | AS, AT                         |
| `schedulesByName`, `rank`                            | `findIndex` at `schedule-plan.ts:188`; AS's due order                        | AS                             |
| `entryArmed` (names armed on entry)                  | `persist.ts:106`, states × schedules per saved timer                         | AS, AR                         |
| `fieldsByName`, `privateFields`                      | `compiled.ts:482` a Set per call                                             | `project`, AT                  |
| `inputFields`, `savedFields`, each sorted            | `identity.ts:16`, `actor-record.ts:170` filter and sort per call             | AR                             |
| `handledTags`                                        | `machine.ts:176`                                                             | construction, `UnhandledEvent` |
| `shape`                                              | AR's `shapeOf` (designed there, not in code)                                 | record stamps                  |
| `slotsAt`, `listOf`, fillings by callback            | AT section 11                                                                | AT (with fragments)            |

Memory: `Node.chain` costs O(N·d); `Node.declared` and the two tag maps O(leaves × the schedules of a chain);
the rest O(N + F + S). The edge graph (`edgesOf`) is not stored: only the CLI reads it, once per
command. Per turn, nothing in this cluster runs.

## 11. Fit to today's code

Each row cites the cast or function and what happens to it. Audit rows: @review.code-audit L3, L4, L8, L9.

| Code                                                                                                        | Verdict      | After                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `machine.ts` `Parts`, `BodyOf`, `MachineBody`                                                               | change       | move to `derive.ts`; `ExactBodyOf`, `RuleNames`; callers: `machine`, `tests/types/*`                              |
| `machine.ts#machine` (271-426)                                                                              | change       | 7.1; returns `Construction`; one decode; callers: every fixture machine, `tests/compile/*`                        |
| `machine.ts:125` `decodedOf`, `:172` `erasedBody`                                                           | delete       | the decode's result (5.7)                                                                                         |
| `machine.ts:131` `erasedWhen`                                                                               | delete       | `slot`                                                                                                            |
| `machine.ts:167` `trustedTokens`                                                                            | delete       | the door: tokens are erased inside                                                                                |
| `machine.ts:176` `handled`                                                                                  | delete       | `handledTags`                                                                                                     |
| `definition.ts` `Definition`, `AnyDefinition`, `Machine`                                                    | change       | `Sch`, `schedules`, `findings`; `Machine<D, R>`; callers: `setup.ts:23` (checked, `f2`), `snapshot.ts`, `refs.ts` |
| `definition.ts:563` `treeOfDefinition`                                                                      | change       | the tree is stored on the definition; one caller left                                                             |
| `tokens.ts:223-352` `ScheduleKey`, `ScheduleParts`, `KeyedConfig`, `KeyedSchedule`, `Erased*`               | delete       | 5.2 (audit L3)                                                                                                    |
| `tokens.ts:228` and `compiled.ts:205` two metadata types                                                    | change       | one `ScheduleMetadata`, `key` from the declaration                                                                |
| `flow.ts:308-313` `Flow.keyed`                                                                              | delete       | plain object; used in 11 fixture and test files                                                                   |
| `flow.ts:251` `selectOf` cast                                                                               | delete       | the decode's result                                                                                               |
| `flow.ts:318` `contextSlot` overload cast                                                                   | delete       | the door                                                                                                          |
| `events.ts:20` `codecOf`, `:26` `trusted`                                                                   | delete       | erased inside doors; `definition.ts#pick` loses its cast                                                          |
| `event-tokens.ts` `EventToken`, `MappedEvent`                                                               | change       | `Cx`, `.Type`                                                                                                     |
| `contract.ts:56` `Ending`, `:70` `ErasedEnding`                                                             | change       | `Cx`; `Ending<never, string, never>`                                                                              |
| `contract.ts:246` `trusted`                                                                                 | delete       | AO's `intake`                                                                                                     |
| `contract.ts:255` `trustedAttempt`                                                                          | delete       | `slot`                                                                                                            |
| `contract.ts:319,385` `transaction`, `resource`                                                             | change       | `HandlesTimeout`, `CoversInput`; `Bound<"read">` without `concurrency`                                            |
| `compiled-parts.ts:22` `endingValue`                                                                        | delete       | `slot`; the mapper gets `{ input, key }` (a runtime change AO owns)                                               |
| `compile-body.ts:196` alternatives cast                                                                     | delete       | the decode's result                                                                                               |
| `compile-body.ts:245-349` `childrenOf`, `childNodes`, `nodesOf`                                             | change       | one walk, an accumulator (10.2)                                                                                   |
| `compile-body.ts:352` `tokenMaps`, `compile-names.ts:17`                                                    | change       | read `Node.chain`                                                                                                 |
| `compile-schedules.ts:123` `scheduleOf`                                                                     | change       | reads the declaration; codecs into `Compiled.schedules`                                                           |
| `compile-schedules.ts:241` `Duration.Input` cast                                                            | delete       | the decode's union member                                                                                         |
| `config.ts:340` `findingsAgainst`                                                                           | change       | returns the decoded value as well as the findings                                                                 |
| `config.ts:216-236` keyed entry Schema                                                                      | delete       | one entry Schema per declared name                                                                                |
| `construction.ts`, `operation-checks.ts`, `core/well-formed.ts`                                             | change       | their findings become `construction` rows of `CHECKS`; no `refuse` in them                                        |
| `entry.ts:45` `wrapped as F`                                                                                | keep         | the `door` cast (5.7)                                                                                             |
| `handles.ts:29` `erase`                                                                                     | keep         | renamed `slot`; the only caller of a Slot                                                                         |
| `core/compiled.ts` `Compiled`, `Node`, `Schedule`                                                           | change       | brands, `schedules`, `rules`, `saved`, section 10's fields; not generic                                           |
| `core/tree.ts#chainOf`, `leafOf`                                                                            | delete       | `Node.chain`, `Node.leaf`                                                                                         |
| `core/tx.ts:68` `branded`                                                                                   | keep         | the mint                                                                                                          |
| `core/tx.ts:168` `draft`; `:380` mailbox                                                                    | keep; delete | AT's rows, unchanged: `draft` stays, the mailbox cast goes                                                        |
| `core/codec.ts:292` JSON entry                                                                              | keep         | `unknown` from a parse callback                                                                                   |
| `core/boundary.ts:127,138,153,162,224,258`                                                                  | keep         | Effect's Schema AST types its own copies internal; the one module that touches them                               |
| `core/boundary.ts:439` `parsed.value as T`                                                                  | keep         | a decode's output                                                                                                 |
| `host/snapshot.ts:244` `asOutside`                                                                          | keep         | becomes `project`, taking the view                                                                                |
| `host/snapshot.ts:66,73,81` `Timers`, `TimerView`                                                           | change       | `TimersOf<D>`; `Timers` stays the erased form                                                                     |
| `host/driver.ts:53` `provided`                                                                              | keep         | the one services crossing                                                                                         |
| `host/run-promise.ts:50`                                                                                    | delete       | calls `provided`                                                                                                  |
| `host/refs.ts:60` `slotRefs`                                                                                | keep         | recorded as a TypeScript limit; not re-run here (H2)                                                              |
| `host/cli/main.ts`, `discover.ts`                                                                           | change       | SC 3.3's result and 7.2; `discover` reads `config.apps`, adds `check`; audit L8                                   |
| `error.ts` `Finding`, `FlowError.message`, `refuse`                                                         | change       | 5.10; the message lists every finding; `refuse` only in `compiledOf`                                              |
| `host/testing/sweep.ts:352`, `generate.ts:941,1207`, `run.ts:640`, `fake.ts:136,764,768`, `test/loose.ts:8` | 5b           | test tooling over erased runs: 5b applies the `project` rule or justifies each                                    |
| `tools/flow-state-lint/rules/`                                                                              | change       | 9.3                                                                                                               |

Casts: 38 disables at HEAD (the review's 41 was counted at `dcf8f2b2`). Their fate: 12 deleted in 5a's files, 4
kept as the named crossings (`door`, `slot`, `project`, `provided`), 10 kept as boundaries (mint, draft, JSON,
seven in `boundary.ts`), 1 deleted by AT (`tx.ts:380`), 1 unverified (`refs.ts:60`), 1 folded into `provided`
(`run-promise.ts:50`), 8 handed to 5b, 1 deleted by AO (`contract.ts:246`).

## 12. Principle ledger

| Principle                                       | Held or traded                                                                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes, not instances                          | Held: section 3. C and D are one point, not removal, and say so                                                                                                                               |
| Full type inference                             | Held for 5.1's compiled rows; `output` is traded (5.5); AT's rows are designed only                                                                                                           |
| Types derive from their source                  | Held: one module, one row per reader. Traded: the core is erased by choice (5.6), with three crossings                                                                                        |
| Cheap graph operations                          | Held: section 10; nothing per turn                                                                                                                                                            |
| One owner per state, one writer per field       | Held: section 4; `indexOf` alone writes derived fields                                                                                                                                        |
| Store facts, derive views                       | Held: findings stored where they arise, an app's derived. Traded: section 10's fields are caches, written in the one construction step and checked by I10; the hot rows are unmeasured (10.2) |
| Explicit states                                 | Held: `Construction` is a tagged union with a total table (7.1)                                                                                                                               |
| Total tables                                    | Held: 7.1, 7.2, and `CHECKS` by `satisfies`                                                                                                                                                   |
| Same rule at every scope                        | Held for root and nested states (depth 2 compiled); fragments and instances are H3                                                                                                            |
| One equality and one codec per fact             | Held: a schedule's key and selection codecs are the declaration's (I11)                                                                                                                       |
| A throw in user code changes only its own check | Held: a throwing body refuses its own machine only                                                                                                                                            |
| General                                         | Checked against `home/Room`, `shop/Cart`, `services/shop/Pay`, `sync`, `number-input` by sidecar inventory; only the toaster was compiled end to end; no fixture was migrated (H1)            |
| Simple                                          | `Flow.keyed`, two metadata types, `enabled`, `Schedule<Key, Why>` and `Compiled<D>` are cut                                                                                                   |
| Effect at the edges                             | Held: the core gains no Effect; the CLI stays on `effect/cli`                                                                                                                                 |

## 13. Seams

- **Cluster 1 (asks, no table reopened):** the send mapper's metadata has no `name` and a derived `key` (Q10);
  every declared reason has a callback in every placement (Q4); `key` is a field record; a name may be placed in
  several states. `Schedule<Key, Why>` is not built: its content is `Compiled.schedules` plus `slot`.
- **Cluster 2:** `Node.chain`, `depth`, `armedBy`, `disarmedBy` and the field indexes exist as section 10 says;
  `Reads<D, Scope, View>` is a `derive.ts` type. A turns rule reads `Turn`; its typed pick is section 4's.
- **Cluster 3:** `Compiled.saved` and `shape` exist; brands as 5.6. `RefMapsOf` is still unproved (H4).
- **Cluster 4:** the authoring doors do not raise for a finding (Q1), which amends AO 6.9's "a refused door
  raises" for those doors only; `HandlesTimeout` matches by tag; `CoversInput` counts optional fields.
- **5b (UI host and test tooling) takes:**
  - `findingsOf(app)` and `compiledOf(app)`: a Story's `run()` and a Runtime start call `compiledOf`; a verdict
    never sees a machine that is not `Built`;
  - `Compiled.rules` and `Machine<D, R>["rules"]`: `RuleBroken.rule` is `R`; whether rules are judged is the
    Runtime setup's option, always on in Stories and the CLI (Q5);
  - `project` as the one outward restore: `read(ref)`, the host's publication and inspection all call it; the
    eight test-tooling casts of section 11;
  - `EvidenceOf<D>`: the public face of `Published` and `Turn` (AT H6) and a fragment's public event address
    (AT H5) are rows 5b fills by the 5.1 rule;
  - `Finding.location` and the source adapter (Q7); SC 3.3's result table with 7.2's rows;
  - the generators and mutation tooling AR and AO handed to "cluster 5".
- **Tasks (no scope changed here):** @task.V3.T113 should build C6 first and take 5.1 to 5.4 as its acceptance;
  the Declared-schedules Task has no file yet and 5.2 is its content; @task.V3.T106 takes 5.3's rules;
  @task.V3.T22 takes 5.9, 5.10 and section 7.

## 14. Questions for the user

Recommendation first. Every departure from TM, SC, a Plan, the code or an accepted answer is here.

1. **Construction returns a value.** [accepted: user 2026-11-23] Nothing raises for a finding until a
   Runtime starts or a Story runs. Departs from `machine()` throwing (@plan.Machines, `machine.ts:265`), SC 3.2
   ("keep throwing") and AO 6.9. R2 Q11 asks for exit 1 with findings.
   Why: recorded in @spec.Types.Q1 (the user, 2026-11-22).
   - A: 5.9, 7.1, 7.2. Trace: `flow.config.ts` imports two machines, one with a negative delay. The import
     completes; `flow check` prints both machines' findings; exit 1.
   - B: keep the throw; an import that fails with a `FlowError` exits 1 and prints that error's findings. Trace:
     the same app prints the first machine's findings only; the second machine was never evaluated; the next run
     shows the next problem.
   - C: as today. Trace: `flow: flow.config.ts did not load: InvalidConfiguration: ...`, first finding only,
     exit 2, which contradicts Q11.
   - A's open part is H8: a definition with a finding must still hand out every token, or module-level code such
     as `const Idle = Toaster.S.IDLE` throws at import and hides the module again.

   ```ts
   // before (existing): const M = machine(Def, body)          // throws FlowError here, at import
   // after:             const M = machine(Def, body)          // M.construction is Built | Refused | Blocked (NEW)
   //                    starting a Runtime from its setup, or running a Story, raises one FlowError
   //                    that holds every finding of the app
   ```
2. **`Machine<D, R>`'s default for `R`.** [accepted: user 2026-11-23] R2 Q3 says an annotated `Machine<typeof
   X>` "defaults its names". A: `never`, so `M.rules.Typo` on an annotated machine is an error. B: `string`, so it
   is `RuleToken | undefined` and the refusal happens only where a `RuleToken` is required. Both compiled.
   Why: recorded in @spec.Types.Q2 (default never) (the user, 2026-11-22).
3. **The body gives the machine's type only its rule names; `turn` is a body token.** [open: 2026-11-21;
   recommend A] R2 Q1's snippet (`body: B & Exact<...>` with no conditional, "`const B`") is corrected to 5.3:
   the conditional is required and `const` is inert. A: as 5.3. B: `Flow.turn` imported (compiles too, but its
   memory type rests on the surrounding record).
4. **Every declared pause reason has a callback in every placement.** [accepted: user 2026-11-23] A:
   required; a declared reason with no callback is a type error. B: optional; then `pausedBy` may name a reason
   that can never hold at that placement. Both compile.
   Why: recorded in @spec.Types.Q4 (the user, 2026-11-22).
5. **A rule has no `enabled`.** [open: 2026-11-21; recommend A] Departs from SC 3.4. Trace today's text:
   `enabled: import.meta.env.DEV` is evaluated in the body at import; under the plain CLI `import.meta.env` is
   undefined, the body throws, and the machine is refused. A: rules are always in `Compiled`; the Runtime setup
   chooses whether to judge (`rules: "judge" | "off"`, read from the app's own environment at the host edge);
   Stories and the CLI always judge. B: keep `enabled` as a plain boolean the user computes.
6. **Terminals are proved by `flow check` only, as `TerminalLeft`.** [accepted: user 2026-11-23] SC Ask 1.
   A: no run-time terminal rule exists, so `RuleBroken` never names a terminal. B: also judge at run time.
   Why: recorded in @spec.Types.Q6 (the user, 2026-11-22).
7. **Source locations: the CLI's adapter, resolving file and export by identity, the line when it can.** [open:
   2026-11-21; recommend A] SC Ask 5. A: `discover` knows which module exported which machine; the adapter adds
   the line by reading that file along the definition path. B: capture at `machine()` from a stack (breaks I9).
   The adapter's algorithm is not spiked (H7).
8. **`Compiled` holds the saved codecs and the schedule codecs.** [accepted: user 2026-11-23] Departs from
   TM:285 ("Compiled gains nothing"); AR Q8. A: 5.2 and 5.6. B: codecs stay on the definition; the core cannot
   then decode a saved key.
   Why: recorded in @spec.Types.Q8 (the user, 2026-11-22).
9. **A schedule's `key` is declared as a field record.** [accepted: user 2026-11-23] TM section 7. A: `key:
   { id: Schema.String }`, always a struct with one canonical text. B: any Schema.
   Why: recorded in @plan.Machines.O5 declared form and @spec.Types.Q9 (the user, 2026-11-22).
10. **A schedule's `send` mapper takes one argument, the firing's metadata, without `name`.** [open: 2026-11-21;
    recommend A] TM-3. A: `({ key, attempt, armedAt, dueAt, firedAt, output })`. B: `(value, { input, key })`
    like an ending, where `value` and `input` have no meaning for a firing.
11. **The metadata's `output` stays `unknown`.** [accepted: user 2026-11-23] AS RT6. A: 5.5. B: declare
    `output: Schema` on the schedule, typed and checked at the firing; one more declared field for a value no
    fixture reads.
    Why: recorded in @spec.Types.Q11 (the user, 2026-11-22).

## 15. Process notes

- **What went wrong (CS section 3):** typing was done per seam after the feature (T104), so body-only facts were
  never in scope; three spikes called a shape problem a TypeScript limit; new facts arrived wide the day after
  the sweep; `today` pins passed while the gap stayed.
- **How to build this cluster:** (1) C6 and `derive.ts` with `Parts` moved, the 41 `Machine<typeof X>`
  assertions updated, check time recorded; (2) the declaration's runtime half and `Compiled.schedules` (AS's
  recommended order), then 5.2's types and the fixture migration off `Flow.keyed`; (3) construction as a value
  with the 96-cell table as the first failing check, before any CLI work; (4) the three crossings, driven by
  the cast-count test going from 38 to its list; (5) `indexOf`, each field landing with its reader's change
  and I10's comparison; (6) rules.
- **First failing checks:** the 13 type patches; the two pins at `schedules.test-d.ts:58,297` inverted; the
  cast-count test; the 96 cells.
- **Where a review pays:** after step 1 (does anything else want to ride on `B`?) and after step 3 (every
  module-level constructor in the fixtures, checked for a raise).
- **Rule for later features:** a feature's design names its declared part, its `Parts` field and its rows
  before code; a type spike that reports a limit lists the shapes tried and is re-run by someone else.

## 16. Sidecar log

| Sidecar                 | Finding                                                                                                                            | Result   | Why                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| casts (Haiku)           | 30 production casts, 8 families, each with its erasure site                                                                        | changed  | I counted 38 disables at HEAD including test tooling; its families became the three crossings         |
| casts                   | `driver.ts:53` widens rather than restores                                                                                         | accepted | read the line; kept as `provided`                                                                     |
| fixtures (Haiku)        | 41 annotated mappers by its grep (CS counted 42), about 24 rule helpers, about 20 restated types, no `as` in fixtures              | accepted | used as the P1 test set; the one-line difference was not chased                                       |
| fixtures                | "the `(value, { input, key })` shape does not occur in fixtures"                                                                   | accepted | the spike showed a second parameter is a compile error today                                          |
| requirements (Haiku)    | about 40 requirements from AS, AT, AR, AO; none exists in code                                                                     | accepted | each is a row of 5.8; I re-read the four type sections                                                |
| requirements            | "RT5 owner is cluster 4", AO says it was not located                                                                               | accepted | answered here as an `EvidenceOf` row, H3                                                              |
| cost and CLI (Haiku)    | no `flow check` command; no `import.meta` in `src/`                                                                                | accepted | read `main.ts` outline and grepped; SC-3 is user code in the body, which is how Q5 treats it          |
| cost and CLI            | 14 construction walks; only the first finding is printed (`error.ts:124`)                                                          | accepted | read `machine.ts` 271-426 and `discover.ts`                                                           |
| cost and CLI            | callers of `malformedOf` and `publicMemory` not traced                                                                             | accepted | left out of 10.3 except `privateFields`, whose scan I read                                            |
| digest (Haiku)          | R2 Q1's snippet differs from BCS's C6                                                                                              | accepted | became Q3                                                                                             |
| digest                  | "typed-machine section 3.1 superseded but not edited"                                                                              | rejected | true, but editing other records is outside this run                                                   |
| spike setup (Sonnet)    | C6 on the copy: 0.77 s to 0.95 s; 41 assertion errors; `Machine<never, infer N>` yields `never`                                    | accepted | re-ran the compile; the trap is why rule names sit on a property, not a phantom of `D`                |
| spike setup             | its `BodyNames<B>` (state paths with bodies)                                                                                       | rejected | not a fact any reader needs; replaced by `RuleNames`                                                  |
| spike A (Sonnet)        | declared schedules compile, 13 refusals, no limit                                                                                  | accepted | re-ran `tsc`; 0 errors in `e-declared.ts`; read the spike file                                        |
| spike A                 | the mapper's metadata drops `name`                                                                                                 | changed  | kept as a question (Q10), not a silent change                                                         |
| spike A                 | check time fell after the change                                                                                                   | rejected | an artefact of failing fixtures; recorded as H5                                                       |
| spike B (Sonnet)        | rule names, `turn` both ways, `.Type`, key cover, timeout, totality compile                                                        | accepted | re-ran `tsc`; only the two expected failures (`f7`, `f8`) remain                                      |
| spike B                 | `AnyBody` supertype assigns inside a generic function                                                                              | changed  | it disproved my own expectation; recorded with its untested part (H2)                                 |
| spike B                 | `CoversInput` over required keys only                                                                                              | changed  | optional fields must count too (AO's trace); the changed form was not re-run (H2)                     |
| spike B                 | recommends default `never`                                                                                                         | accepted | Q2                                                                                                    |
| final spike (Sonnet)    | the walkthrough compiles merged; `({ key }) =>` with `key` unused is an error under `noUnusedParameters`                           | accepted | fixed the line, re-ran `tsc` myself: no error from the block                                          |
| final spike             | `CoversInput` over all fields needs `KeyFields` widened                                                                            | accepted | 5.4 now says so                                                                                       |
| final spike             | `AnyBody` needs `Partial` records; `on` left `unknown` in its run                                                                  | accepted | 5.6; `on` stays in H2                                                                                 |
| final spike             | `Bound<"read">` and the `home/Room` migration not run                                                                              | accepted | H2, H5                                                                                                |
| cites (Haiku, high)     | cast breakdown is 12 and 4, not 13 and 3; `machine.ts:265`; 20 `chainOf` occurrences with 8 in `tree.ts`; `Flow.keyed` in 11 files | accepted | each corrected in place                                                                               |
| cites                   | "`Exact` is not in `src/`", "`shapeOf` and `edgesOf` are not in code"                                                              | rejected | they are this design's, AR's and SC's new names, marked as such                                       |
| adversary (Haiku, high) | construction warnings were dropped; a warning-only definition blocked; `Blocked` skipped the wrong-kind raise                      | accepted | `Built.warnings`; "an error finding"; the raise is checked first (5.9, 7.1, 8)                        |
| adversary               | severity stored on a finding could disagree with its row                                                                           | accepted | a finding stores no severity (5.10, I8)                                                               |
| adversary               | shared owners reported twice; order undefined                                                                                      | accepted | `Finding.owner`, each owner once, the order of 7.2                                                    |
| adversary               | the toaster left `Browned` and `Ping` unhandled                                                                                    | accepted | handlers added, block recompiled                                                                      |
| adversary               | type-only refusals had no construction twin                                                                                        | accepted | the twin rule of 5.2                                                                                  |
| adversary               | I1, I3, I8, I11 and five planted faults had no check; the 80-cell oracle let a `Blocked` body run                                  | accepted | 9.2 rewritten: 96 cells, exact run counts, three more checks                                          |
| adversary               | E and G called "removed" while resting on behaviour or lint                                                                        | accepted | section 3 now says one point                                                                          |
| adversary               | rule tokens are typed on a machine whose body never ran                                                                            | changed  | kept, with the bound stated in section 1 and H9: every reader raises first                            |
| adversary               | "a graph error runs" contradicts "never runs"                                                                                      | changed  | P4 reworded: only construction errors stop a run                                                      |
| adversary               | `paused` evaluation time, memory identity across turns, the key's canonical text are undefined                                     | rejected | AS's and AT's rules, not restated here                                                                |
| prior art               | not run as a sidecar                                                                                                               | n/a      | time; XState v5 `setup` and Effect Schema's `Type` are the shapes 5.1 and 5.3 follow, unverified here |

## 17. Open holes

| Id  | Severity | Hole                                                                                                                                                     | Why open                                       |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| H1  | medium   | Only one new definition was compiled end to end; no real fixture was migrated to declared schedules (the `home/Room` migration was not reached)          | time                                           |
| H2  | medium   | Not compiled: `AnyBody`'s `on` handlers at `never`; `Bound<"read">` without `concurrency`; `refs.ts:60`'s recorded limit; `R` when `B` takes its default | time                                           |
| H3  | high     | AT's rows (props, emits, fragments, slots, `Reads<D, Scope, View>`), `EvidenceOf<D>`, H5 and H6 are designed by rule only; nothing compiled              | the code they type does not exist yet          |
| H4  | medium   | `RefMapsOf` over AR's real shapes, so `RefRows` totality, is unproved; only the mapped-type mechanism compiled                                           | AR's shape types are not in code               |
| H5  | medium   | The full derivation's check cost with every fixture migrated; the JSON-form reuse of 10.2; construction has no bench                                     | needs the fixture migration                    |
| H6  | medium   | Family D's members not yet rows: `owed[].reason`, `Ended.reason`, `decline`'s `why`, the Story checkpoint names                                          | not inventoried against `derive.ts` one by one |
| H7  | low      | The source adapter's algorithm (module of an export, line along a path)                                                                                  | not spiked                                     |
| H8  | high     | A definition with a finding must still hand out every token: which of today's definition findings allow that was not walked, and Q1 A depends on it      | the definition's finding list was not walked   |
| H9  | low      | Rule tokens are typed on a machine that is not `Built`, where the record is empty; bounded by 7.2, not removed                                           | accepted as a stated limit                     |
