# Types: companion to the Spec

**Bottom line:** every type user code sees is a row of one type-only module, `derive.ts`, computed from the
definition; the body is captured exactly and gives the machine only what the body alone authors, its rule names. This
file holds what does not fit @spec.Types: the walkthrough, the problem classes, the principle ledger, the fit to
today's code, the seams, the questions with their before and after, the open holes and the process notes. The Spec is
pre-coding analysis, to be followed as best-guess guidance and revised whenever building shows it wrong
(`wiki/specs/specs.log` records each change). Everything marked proposed is the user's call.

Code paths are under `packages/flow-state-v3/`. Every keyword in a code block is marked existing, NEW, CHANGED or
user-defined. The core stays erased and is not generic in `D`; a type crosses between the typed shell and the erased
core at three named functions and nowhere else. Construction never throws for a finding: a machine is `Built`,
`Refused` or `Blocked`, so `flow check` reports every machine of an app.

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
- **A send:** `actor.send(Toaster.E.Drop({ slot: "a" }))` compiles; `Drop({ slots: "a" })`, `Drop({ slot: 1 })` and
  another definition's event do not. `Toaster.E.Drop.Type` is `{ readonly slot: string }`.
- **A Story step:** `story.send(toaster, Toaster.E.Drop({ slot: "a" })).checkpoint("browning")`, then
  `run.checkpoints.browning.read(toaster).schedules.brown`; `.rules({ expectBroken:
  [ToasterMachine.rules.NeverOverFour] })` compiles and `ToasterMachine.rules.NeverOverFor` does not. The rule names
  are the one fact that comes from the body.
- **`flow check`:** nothing targets `TOASTING.DARK`, so it prints
  `warning StateUnreachable Kitchen/Toaster states.TOASTING.states.DARK` with `toaster.ts (export ToasterMachine)` and
  exits 0. Change `idle`'s delay to `"-5 minutes"`: `machine()` does not throw; the machine is `Refused`, `flow check`
  prints `error DelayOutOfRange Kitchen/Toaster states.IDLE.schedules.idle.schedule` beside the findings of every
  other machine of the app and exits 1; starting a Runtime or running a Story of that app fails with one `FlowError`
  holding the same findings.

The block compiled as written, with no annotation, on one merged copy of the real package, and every bullet's type
claim was asserted two-sided there (a scratch spike, not kept). The `flow check` bullet is design: no `check` command
exists today. On a machine that is not `Built` the `rules` record is empty at run time although its type names the
rules; every reader of a rule token is a Story or a setup, which raises first (Spec `open`, Q17).

## 2. Required properties, in user terms

- **P1. Nothing is typed by hand.** A handler, mapper, schedule callback, rule, snapshot read, send or Story step
  needs no annotation, and no user type restates a Schema or a declaration (R1).
- **P2. A misspelt name does not compile** wherever Flow holds the name: a state, event, field, operation, schedule,
  key field, pause reason, rule or slot, in the body and at every reader (R2).
- **P3. A type never promises what the runtime does not deliver.** An unkeyed schedule's `key` is `undefined` in the
  type and at run time; a snapshot field is typed exactly as it is published (R3).
- **P4. A definition or body with a finding is reported, whole, beside every other machine's findings.** It never
  hides another machine and never shows only its first finding; one whose construction has an error never runs. An
  argument of the wrong kind is a module that does not load (R4, R11).
- **P5. A finding says where:** the machine, the definition path, and the file when the CLI can resolve it (R5).
- **P6. The same source gives the same machine:** no environment, clock, random or stack read at construction (R6).
- **P7. Types and construction stay cheap:** check time grows by a stated bound; construction is linear in the
  definition; nothing fixed per machine is recomputed per turn (R7).

## 3. Problem classes

| Family                                                          | Members                                                                                                                                                                                 | Handling                                                                                                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. A fact with two sources                                      | body-only schedule names, keys, reasons; `restartOn` as `unknown`; 42 annotated mappers, 32 hand-typed parameters, about 20 restated types; `Timers`, `ScheduleKey`, two metadata types | **Removed:** a fact read outside the body is declared on the definition; every reader type is a `derive.ts` row; no second declaration site exists                          |
| B. The body is checked and dropped                              | excess keys compile (`excess-keys.test-d.ts:69,93,99,104`); `gaurd`, `pausd`; rule names unreachable                                                                                    | **Removed:** `B & Exact<B, MachineBody<D>>`; an unknown key has type `never`                                                                                                |
| C. An erased type restored in many places                       | 17 erasure casts in 9 files; 38 disables at HEAD                                                                                                                                        | **One point each:** three crossings, `door`, `slot`, `project`; not removed, since each is a cast                                                                           |
| D. Wide where Flow holds the name                               | `pausedBy: string[]`, `owed[].reason`, evidence names as `string`, `rules` as text                                                                                                      | **One point:** public types are assembled only in `derive.ts`; a lint row refuses a wide name in an exported signature. Members not yet rows are debt (Spec Q16)            |
| E. A construction failure is a throw                            | first finding only (`error.ts:124`); body throw; the other machines of the module lost; 5 walks to refuse                                                                               | **One point:** authoring doors return a value, `Built`, `Refused` or `Blocked`; only `compiledOf` raises for a finding. Not removal: a signature cannot forbid a throw      |
| F. One reason, two severities or two homes                      | `UnhandledEvent` (`machine.ts:225` against a check row), `DelayOutOfRange`                                                                                                              | **Removed:** reasons are the keys of one table, each row one severity and one stage; a finding stores no severity                                                           |
| G. A host fact inside construction                              | `enabled: import.meta.env.DEV`; positions from a stack                                                                                                                                  | `enabled` and positions **removed:** a rule has no such field and `Compiled` no position type (Q5, Q7). A body that reads the environment anyway: **one point**, a lint row |
| H. Fixed per machine, recomputed per call or per walk           | the field scans of the Spec's `DerivedFields` (5 and 9 rows)                                                                                                                            | **One point:** `indexOf`, one pass, the only writer of `Compiled`'s derived fields                                                                                          |
| I. A type test that cannot fail, or passes for the wrong reason | one-sided refusals, `today` pins (`schedules.test-d.ts:58,297`), recorded limits never re-run                                                                                           | **One point:** the patch set of T1, each two-sided, each pin named with the row that flips it; `paired-refusals` stays at 0                                                 |

## 4. Principle ledger

| Principle                                       | Held or traded                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes, not instances                          | Held: section 3. C and D are one point, not removal, and say so                                                                                                                                                                                                                                      |
| Full type inference                             | Held for the compiled rows of `Derivation`; `output` is traded (`OutputKept`); the rows of `Changes` are designed only                                                                                                                                                                               |
| Types derive from their source                  | Held: one module, one row per reader. Traded: the core is erased by choice (`ErasedCompiled`), with three crossings                                                                                                                                                                                  |
| Cheap graph operations                          | Held: the index table; nothing per turn                                                                                                                                                                                                                                                              |
| One owner per state, one writer per field       | Held: `StateInventory`; `indexOf` alone writes derived fields                                                                                                                                                                                                                                        |
| Store facts, derive views                       | Held: findings stored where they arise, an app's derived. Traded, once, for compile-time indexes only: built once by `indexOf`, never written at run time, checked by the I10 test (`indexDrift`). A run-time cache (the input gate of `Schedules`, the JSON-form reuse) lands only with a bench row |
| Cache only when measured                        | Traded for the round's "cheap operations" principle, for compile-time indexes only: the hot rows of the index table are unmeasured                                                                                                                                                                   |
| Explicit states                                 | Held: `Construction` is a tagged union with a total table                                                                                                                                                                                                                                            |
| Total tables                                    | Held: `Construction`, `Loading`, and `CHECKS` by `satisfies`                                                                                                                                                                                                                                         |
| Same rule at every scope                        | Open: root and nested states held (depth 2 compiled); fragments and instances are Q13                                                                                                                                                                                                                |
| One equality and one codec per fact             | Held: a schedule's key and selection codecs are the declaration's (I11)                                                                                                                                                                                                                              |
| A throw in user code changes only its own check | Held: a throwing body refuses its own machine only (the family rule of `Schedules`, `ThrowingRead`)                                                                                                                                                                                                  |
| General                                         | Checked against `home/Room`, `shop/Cart`, `services/shop/Pay`, `sync`, `number-input` by inventory; only the toaster was compiled end to end; no fixture was migrated (Q13)                                                                                                                          |
| Simple                                          | `Flow.keyed`, two metadata types, `enabled`, `Schedule<Key, Why>` and `Compiled<D>` are cut                                                                                                                                                                                                          |
| Effect at the edges                             | Held: the core gains no Effect; the CLI stays on `effect/cli`                                                                                                                                                                                                                                        |

## 5. Fit to today's code

Each row cites the cast or function and what happens to it. Coders use this to know which code is redundant or to be
superseded. Casts: 38 disables at HEAD in `src/` production files (the earlier count of 41 was taken on an older
commit; `tests/` and `fixtures/` are not counted). Their fate: 12 deleted in this Spec's files, 4 kept as the named
crossings (`door`, `slot`, `project`, `provided`), 10 kept as boundaries (mint, draft, JSON, seven in `boundary.ts`),
1 deleted by `Changes` (`tx.ts:380`), 1 unverified (`refs.ts:60`), 1 folded into `provided` (`run-promise.ts:50`), 8
handed to `Host`, 1 deleted by `Operations` (`contract.ts:246`).

| Code                                                                                                        | Verdict      | After                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `machine.ts` `Parts`, `BodyOf`, `MachineBody`                                                               | change       | move to `derive.ts`; `ExactBodyOf`, `RuleNames`; callers: `machine`, `tests/types/*`                        |
| `machine.ts#machine` (271-426)                                                                              | change       | table `Construction`; returns `Construction`; one decode; callers: every fixture machine, `tests/compile/*` |
| `machine.ts:125` `decodedOf`, `:172` `erasedBody`                                                           | delete       | the decode's result (`Crossings`)                                                                           |
| `machine.ts:131` `erasedWhen`                                                                               | delete       | `slot`                                                                                                      |
| `machine.ts:167` `trustedTokens`                                                                            | delete       | the door: tokens are erased inside                                                                          |
| `machine.ts:176` `handled`                                                                                  | delete       | `handledTags`                                                                                               |
| `definition.ts` `Definition`, `AnyDefinition`, `Machine`                                                    | change       | `Sch`, `schedules`, `findings`; `Machine<D, R>`; callers: `setup.ts:23` (checked), `snapshot.ts`, `refs.ts` |
| `definition.ts:563` `treeOfDefinition`                                                                      | change       | the tree is stored on the definition; one caller left                                                       |
| `tokens.ts:223-352` `ScheduleKey`, `ScheduleParts`, `KeyedConfig`, `KeyedSchedule`, `Erased*`               | delete       | `DeclaredSchedules`                                                                                         |
| `tokens.ts:228` and `compiled.ts:205` two metadata types                                                    | change       | one `ScheduleMetadata`, `key` from the declaration                                                          |
| `flow.ts:308-313` `Flow.keyed`                                                                              | delete       | plain object; used in 11 fixture and test files                                                             |
| `flow.ts:251` `selectOf` cast                                                                               | delete       | the decode's result                                                                                         |
| `flow.ts:318` `contextSlot` overload cast                                                                   | delete       | the door                                                                                                    |
| `events.ts:20` `codecOf`, `:26` `trusted`                                                                   | delete       | erased inside doors; `definition.ts#pick` loses its cast                                                    |
| `event-tokens.ts` `EventToken`, `MappedEvent`                                                               | change       | `Cx`, `.Type`                                                                                               |
| `contract.ts:56` `Ending`, `:70` `ErasedEnding`                                                             | change       | `Cx`; `Ending<never, string, never>`                                                                        |
| `contract.ts:246` `trusted`                                                                                 | delete       | `Operations`' `intake`                                                                                      |
| `contract.ts:255` `trustedAttempt`                                                                          | delete       | `slot`                                                                                                      |
| `contract.ts:319,385` `transaction`, `resource`                                                             | change       | `HandlesTimeout`, `CoversInput`; `Bound<"read">` without `concurrency`                                      |
| `compiled-parts.ts:22` `endingValue`                                                                        | delete       | `slot`; the mapper gets `{ input, key }` (a runtime change `Operations` owns)                               |
| `compile-body.ts:196` alternatives cast                                                                     | delete       | the decode's result                                                                                         |
| `compile-body.ts:245-349` `childrenOf`, `childNodes`, `nodesOf`                                             | change       | one walk, an accumulator (construction cost, `realization`)                                                 |
| `compile-body.ts:352` `tokenMaps`, `compile-names.ts:17`                                                    | change       | read `Node.chain`                                                                                           |
| `compile-schedules.ts:123` `scheduleOf`                                                                     | change       | reads the declaration; codecs into `Compiled.schedules`                                                     |
| `compile-schedules.ts:241` `Duration.Input` cast                                                            | delete       | the decode's union member                                                                                   |
| `config.ts:340` `findingsAgainst`                                                                           | change       | returns the decoded value as well as the findings                                                           |
| `config.ts:216-236` keyed entry Schema                                                                      | delete       | one entry Schema per declared name                                                                          |
| `construction.ts`, `operation-checks.ts`, `core/well-formed.ts`                                             | change       | their findings become `construction` rows of `CHECKS`; no `refuse` in them                                  |
| `entry.ts:45` `wrapped as F`                                                                                | keep         | the `door` cast                                                                                             |
| `handles.ts:29` `erase`                                                                                     | keep         | renamed `slot`; the only caller of a Slot                                                                   |
| `core/compiled.ts` `Compiled`, `Node`, `Schedule`                                                           | change       | brands, `schedules`, `rules`, `saved`, the derived fields; not generic                                      |
| `core/tree.ts#chainOf`, `leafOf`                                                                            | delete       | `Node.chain`, `Node.leaf` (28 uses of `chainOf` in `src`, 8 inside `tree.ts`)                               |
| `core/tx.ts:68` `branded`                                                                                   | keep         | the mint                                                                                                    |
| `core/tx.ts:168` `draft`; `:380` mailbox                                                                    | keep; delete | `draft` stays, the mailbox cast goes (`Changes`)                                                            |
| `core/codec.ts:292` JSON entry                                                                              | keep         | `unknown` from a parse callback                                                                             |
| `core/boundary.ts:127,138,153,162,224,258`                                                                  | keep         | Effect's Schema AST types its own copies internal; the one module that touches them                         |
| `core/boundary.ts:439` `parsed.value as T`                                                                  | keep         | a decode's output                                                                                           |
| `host/snapshot.ts:244` `asOutside`                                                                          | keep         | becomes `project`, taking the view                                                                          |
| `host/snapshot.ts:66,73,81` `Timers`, `TimerView`                                                           | change       | `TimersOf<D>`; `Timers` stays the erased form                                                               |
| `host/driver.ts:53` `provided`                                                                              | keep         | the one services crossing                                                                                   |
| `host/run-promise.ts:50`                                                                                    | delete       | calls `provided`                                                                                            |
| `host/refs.ts:60` `slotRefs`                                                                                | keep         | recorded as a TypeScript limit; not re-run here (Q12)                                                       |
| `host/cli/main.ts`, `discover.ts`                                                                           | change       | the CLI's result table and `Loading`; `discover` reads `config.apps`, adds `check`                          |
| `error.ts` `Finding`, `FlowError.message`, `refuse`                                                         | change       | `FindingShape`; the message lists every finding; `refuse` only in `compiledOf`                              |
| `host/testing/sweep.ts:352`, `generate.ts:941,1207`, `run.ts:640`, `fake.ts:136,764,768`, `test/loose.ts:8` | `Host`       | test tooling over erased runs: `Host` applies the `project` rule or justifies each                          |
| `tools/flow-state-lint/rules/`                                                                              | change       | the lint rows in the Spec's `realization`                                                                   |

Construction sweep, rows of the Spec's `DerivedFields` and `realization` cost against the code: `chainOf` (20 to 28
uses), `leafOf`, `declaredOn`, the arming scans, `findIndex` at `schedule-plan.ts:188`, `persist.ts:106`,
`compiled.ts:482`, `identity.ts:16`, `actor-record.ts:170`, `machine.ts:176`.

## 6. What each other Spec asked of this one

| Requirement                                                                          | Answer                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Schedules` RT1, RT2, RT3, RT7                                                       | `DeclaredSchedules`, compiled                                                                                                            |
| `Schedules` RT4 (one typed point of erasure, carrying the codecs)                    | `slot` and `Compiled.schedules`; the `Schedule<Key, Why>` generic is not needed (`ErasedCompiled`); designed                             |
| `Schedules` RT5 (issue source and evidence typed by declared names)                  | `EvidenceOf<D>` rows and `ScheduleReads<Key, Why>` (G8); designed, not compiled (Q13)                                                    |
| `Schedules` RT6                                                                      | `OutputKept`: kept `unknown`, two shapes failed                                                                                          |
| `Schedules` indexes `schedulesAt`, `byName`, `rank`, `armedBy`, `disarmedBy`         | `DerivedFields`                                                                                                                          |
| `Changes` declared parts; `Compiled.slots`, `fragments`, `emits`, `props`            | `Parts` rows and `Compiled` fields by the `Derivation` rule; designed, not compiled: no code exists (Q13)                                |
| `Changes` indexes `chain`, `depth`, `fieldsByName`, private set, `slotsAt`, `listOf` | `DerivedFields`                                                                                                                          |
| `Changes`: a view addressing a fragment's public event                               | G6, a `derive.ts` row of the fragment's declaration                                                                                      |
| `Changes`: the public face of `Published.incarnation` and `Turn`                     | `EvidenceOf<D>`, G7; a turns rule's input is its typed pick; fields are `Host`'s                                                         |
| `Records` `Compiled.saved`, Q8                                                       | granted (`ErasedCompiled`); the same answer once in both Specs (Q8)                                                                      |
| `Records` `RefRows` and the step table total                                         | a mapped type over a literal union is total: a missing or extra key is an error. `RefMapsOf` over the real shapes was not compiled (Q14) |
| `Records` brands, one constructor each                                               | `ErasedCompiled`, one list                                                                                                               |
| `Operations` mapper proof                                                            | `MapperTypes`, compiled                                                                                                                  |
| `Operations` `resource` key, `TimeoutError`, `Bound<"read">`                         | `MapperTypes`: two compiled, one designed                                                                                                |
| `Operations` door types from `derive.ts`; the `throw` lint                           | `Crossings`; the lint row is in `realization`                                                                                            |
| `Operations` `trusted` casts (`contract.ts:246,255`)                                 | `:246` removed by `intake`; `:255` is a call through `slot`                                                                              |

## 7. Seams with other Specs

- `Schedules` (asks, no table reopened): the send mapper's metadata has no `name` and a derived `key` (Q10); every
  declared reason has a callback in every placement (Q4); `key` is a field record; a name may be placed in several
  states. `Schedule<Key, Why>` is not built: its content is `Compiled.schedules` plus `slot`.
- `Changes`: `Node.chain`, `depth`, `armedBy`, `disarmedBy` and the field indexes exist as `DerivedFields` says;
  `Reads<D, Scope, View>` is a `derive.ts` type. A turns rule reads `Turn`; its typed pick is in the Spec's
  `CallbackInputs`. Its cluster's duties for `onEmit`, `setProps` and the fragment event address are rows G5 to G7.
- `Records`: `Compiled.saved` and `shape` exist; brands as `ErasedCompiled`. `RefMapsOf` is still unproved (Q14).
- `Operations`: the authoring doors do not raise for a finding (Q1), which amends "a refused door raises" for those
  doors only; `HandlesTimeout` matches by tag; `CoversInput` counts optional fields. `CATALOG`
  (`InvalidConfiguration.reasons`) is `keyof typeof CHECKS`, derived.
- `Host` takes:
  - `findingsOf(app)` and `compiledOf(app)`: a Story's `run()` and a Runtime start call `compiledOf`; a verdict never
    sees a machine that is not `Built`;
  - `Compiled.rules` and `Machine<D, R>["rules"]`: `RuleBroken.rule` is `R`; whether rules are judged is the Runtime
    setup's option, always on in Stories and the CLI (Q5);
  - `project` as the one outward restore: `read(ref)`, the host's publication and inspection all call it; the eight
    test-tooling casts of the fit table;
  - `EvidenceOf<D>`: the public face of `Published` and `Turn` and a fragment's public event address are rows `Host`
    fills by the `Derivation` rule;
  - `Finding.location` and the source adapter (Q7); the CLI's result table with `Loading`'s rows;
  - the generators and mutation tooling `Records` and `Operations` handed to the test tooling.
- Tasks (no scope changed here): @task.V3.T113 builds the body capture first and takes the type sections as its
  acceptance, with the two spikes of Q12 as its first rows; the declared-schedules runtime half is @task.V3.T120 and
  `DeclaredSchedules` is its content; @task.V3.T106 takes `BodyCapture`'s rules; @task.V3.T22 takes
  `ConstructionValue`, `FindingShape`, `Loading` and the walk of Q12.

## 8. The developer's walk (types only)

Twelve apps and the two shared services were read against the designs. What this Spec changes for them: keyed
schedules become declared (`home`); `key.id` is typed, so `key["id"] ?? ""` goes; `(e: Declined)` mapper annotations
go (`transfers`); a machine that refers to itself (`player`, `sync`) keeps its `Machine<typeof X>` annotation and
costs the rule tokens, a stated limit. Gaps this Spec answers:

- **Hoisted callbacks.** Every app hoists helpers out of the body and types their argument by hand
  (`number-input/machines/stepper.ts`, `shop/machines/cart.ts`, `home/machines/room.ts`, `sync/machines/mirror.ts:38`).
  Fix: `Reads<D, Scope, View>` and `E.X.Type` are exported as the author-facing names; a copied shape is a lint
  finding.
- **A shared body.** `payBody` (`services/shop/machines/pay.ts:170`) hand-types
  `Parameters<typeof machine<typeof Pay>>[1]`. Fix: export the existing `BodyTokens<D>` (G2); the return type is
  inferred.
- **Decline reasons.** `deny("AtBound")` has a `why`; its union per event is not yet a row (G3, Q16).

## 9. Questions, with before and after

All proposed; recommendation first. Each departs from an earlier design, a Plan, the code or an accepted answer.

1. **Construction returns a value.** Nothing raises for a finding until a Runtime starts or a Story runs. Departs
   from `machine()` throwing (@plan.Machines, `machine.ts:265`) and an earlier ruling to keep the throw. The user
   wants exit 1 with findings for a construction error.
   - A: `ConstructionValue`, `Construction`, `Loading`. Trace: `flow.config.ts` imports two machines, one with a
     negative delay. The import completes; `flow check` prints both machines' findings; exit 1.
   - B: keep the throw; an import that fails with a `FlowError` exits 1 and prints that error's findings. Trace: the
     same app prints the first machine's findings only; the next run shows the next problem.
   - C: as today. Trace: `flow: flow.config.ts did not load: InvalidConfiguration: ...`, first finding only, exit 2.
   - A holds only for the findings that leave every token in place; a definition finding that cannot hand out tokens
     keeps raising at `definition()`, as a wrong-kind argument does (Spec Q12).

   ```ts
   // before (existing): const M = machine(Def, body)          // throws FlowError here, at import
   // after:             const M = machine(Def, body)          // M.construction is Built | Refused | Blocked (NEW)
   //                    starting a Runtime from its setup, or running a Story, raises one FlowError
   //                    that holds every finding of the app
   ```
2. **`Machine<D, R>`'s default for `R`.** A: `never`, so `M.rules.Typo` on an annotated machine is an error. B:
   `string`, so it is `RuleToken | undefined`. Both compiled.

   ```ts
   // A: const M: Machine<typeof Def> = machine(Def, body); M.rules.Typo   // a type error
   // B: the same line: M.rules.Typo is RuleToken | undefined
   ```
3. **The body gives the machine's type only its rule names; `turn` is a body token.** A: as `BodyCapture`. B: an
   imported `Flow.turn` (compiles too, but its memory type rests on the surrounding record). The earlier snippet
   without the conditional is corrected: the conditional is required and `const` is inert.

   ```ts
   // earlier: machine<D, const B>(definition: D, body: B & Exact<B, MachineBody<D>>)
   // after:   machine<D, const B extends MachineBody<D> = MachineBody<D>>(
   //            definition: D, body: ExactBodyOf<NoInfer<D>, B>): Machine<D, RuleNames<B>>
   //          ExactBodyOf<D, B> = [D] extends [AnyDefinition] ? (tokens) => B & Exact<...> : never   // required
   ```
4. **Every declared pause reason has a callback in every placement.** A: required. B: optional; then `pausedBy` may
   name a reason that can never hold at that placement. Both compile.

   ```ts
   // definition: schedules: { dismiss: { pausedBy: ["Hovered", "Hidden"] } }
   // before: paused: { Hovered: ... }                    // compiles; Hidden can never hold here
   // after:  the same line is a type error: `Hidden` is missing
   ```
5. **A rule has no `enabled`; the run rules are one list in one module.** Overturns the decided `enabled` flag
   (@plan.Rules.O6). Trace today's text: `enabled: import.meta.env.DEV` is evaluated in the body at import; under the
   plain CLI `import.meta.env` is undefined, the body throws and the machine is refused. A: rules are always in
   `Compiled`; the Runtime setup chooses whether to judge; Stories and the CLI always judge; the list moves out of
   `flow.config.ts` into a module the config imports, because the config already imports every Story. B: keep
   `enabled` as a plain boolean the user computes.

   ```ts
   // today:  tests/rules/rules.ts exports the rule list and imports the test runner; flow.config.ts has no rules
   //         Story.app(setup, { id, fixtures, world })                                    // existing
   // before: rule({ enabled: import.meta.env.DEV, ... })           // proposed earlier; throws under the plain CLI
   // after:  runtimeSetup({ app, rules: "judge" })                  // NEW option: "judge" | "off"
   //         export const rules = [...]                             // tests/rules/list.ts, no test-runner import
   //         Story.app(setup, { id, fixtures, world, rules })       // NEW field; the config imports the same value
   ```
6. **Terminals are proved by `flow check` only, as `TerminalLeft`.** A: no run-time terminal rule exists, so
   `RuleBroken` never names a terminal. B: also judge at run time. Keeps the decided "proved, not judged by runs".

   ```ts
   // before: a run rule also reports RuleBroken for a left terminal
   // after:  `flow check` prints TerminalLeft; no run-time rule names a terminal
   ```
7. **Source locations: the CLI's adapter, resolving file and export by identity, the line when it can.** A:
   `discover` knows which module exported which machine; the adapter adds the line by reading that file along the
   definition path. B: capture at `machine()` from a stack (breaks I9). The algorithm is not spiked.

   ```ts
   // today: Finding { path }
   // after: Finding { path, location: Option<{ file, export, line }> }   // NEW: location, filled by the CLI only
   ```
8. **`Compiled` holds the saved codecs and the schedule codecs.** Departs from the earlier "Compiled gains nothing".
   A: `DeclaredSchedules` and `ErasedCompiled`. B: codecs stay on the definition; the core cannot then decode a saved
   key. The same question in `Records`: one answer, once.
9. **A schedule's `key` is declared as a field record.** Closed by `Schedules` R16: `key: { id: Schema.String }`,
   always a struct with one canonical text.
10. **A schedule's `send` mapper takes one argument, the firing's metadata, without `name`.** A: `({ key, attempt,
    armedAt, dueAt, firedAt, output })`. B: `(value, { input, key })` like an ending, where `value` and `input` have no
    meaning for a firing.

    ```ts
    // before: send: E.Polled.from(({ key, firedAt }) => ({ id: key["id"] ?? "", at: firedAt }))
    // after:  send: E.Polled.from(({ key, firedAt }) => ({ id: key.id, at: firedAt }))   // key typed
    ```
11. **The metadata's `output` stays `unknown`.** A: `OutputKept`. B: declare `output: Schema` on the schedule, typed
    and checked at the firing; one more declared field for a value no fixture reads.

    ```ts
    // after: send: E.Fired.from(({ output }) => ...)       // output: unknown; decode it with a Schema if read
    ```

## 10. Open holes

| Id  | Severity | Hole                                                                                                                                                     | Why open                                       |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| H1  | medium   | Only one new definition was compiled end to end; no real fixture was migrated to declared schedules (the `home/Room` migration was not reached)          | time                                           |
| H2  | medium   | Not compiled: `AnyBody`'s `on` handlers at `never`; `Bound<"read">` without `concurrency`; `refs.ts:60`'s recorded limit; `R` when `B` takes its default | time; the first spike of Spec Q12              |
| H3  | high     | The rows of `Changes` (props, emits, fragments, slots, `Reads<D, Scope, View>`), `EvidenceOf<D>`, G5 to G8 are designed by rule only; nothing compiled   | the code they type does not exist yet          |
| H4  | medium   | `RefMapsOf` over `Records`' real shapes, so `RefRows` totality, is unproved; only the mapped-type mechanism compiled                                     | `Records`' shape types are not in code         |
| H5  | medium   | The full derivation's check cost with every fixture migrated; the JSON-form reuse of the construction cost; construction has no bench                    | needs the fixture migration                    |
| H6  | medium   | Family D's members not yet rows: `owed[].reason`, `Ended.reason`, `decline`'s `why`, the Story checkpoint names                                          | not inventoried against `derive.ts` one by one |
| H7  | low      | The source adapter's algorithm (module of an export, line along a path)                                                                                  | not spiked                                     |
| H8  | high     | A definition with a finding must still hand out every token: which of today's definition findings allow that was not walked, and Q1 A depends on it      | the definition's finding list was not walked   |
| H9  | low      | Rule tokens are typed on a machine that is not `Built`, where the record is empty; bounded by `Loading`, not removed                                     | accepted as a stated limit                     |

Where each hole goes: H2 and H8 are the first acceptance rows of @task.V3.T113 and @task.V3.T22, and H8's per-finding
answer is a build-time choice in @task.V3.T113's description; H1, H3, H5 and H6 are build rows of @task.V3.T113
(Spec Q13, Q15, Q16); H4 is proved when `Records`' shapes are code (@task.V3.T92, Spec Q14); H7 is spiked with the
source adapter; H9 is a stated limit (Q17). The Spec's open section carries each as Q12 to Q17.

## 11. Process notes

- **What went wrong:** typing was done per seam after the feature, so body-only facts were never in scope; three
  spikes called a shape problem a TypeScript limit; new facts arrived wide the day after the sweep; `today` pins
  passed while the gap stayed.
- **How to build this Spec:** (1) body capture and `derive.ts` with `Parts` moved, the 41 `Machine<typeof X>`
  assertions updated, check time recorded; (2) the declaration's runtime half and `Compiled.schedules`, then the
  schedule types and the fixture migration off `Flow.keyed`; (3) construction as a value with the 96-cell table as
  the first failing check, before any CLI work; (4) the three crossings, driven by the cast-count test going from 38
  to its list; (5) `indexOf`, each field landing with its reader's change and the I10 comparison; (6) rules.
- **First failing checks:** the 13 type patches; the two pins at `schedules.test-d.ts:58,297` inverted; the
  cast-count test; the 96 cells.
- **Where a review pays:** after step 1 (does anything else want to ride on `B`?) and after step 3 (every
  module-level constructor in the fixtures, checked for a raise).
- **Migration cost seen in the copy:** 41 compile errors in type tests that assert `machine()` returns exactly
  `Machine<typeof X>`, and `fixtures/sync/stories/structure.ts:61`, whose planted wrong body becomes a type error and
  needs `@ts-expect-error`. The 46 failing fixtures of the copy are the `Flow.keyed` uses.
- **Rule for later features:** a feature's design names its declared part, its `Parts` field and its rows before
  code; a type spike that reports a limit lists the shapes tried and is re-run by someone else.
- **Prior art, unverified:** XState v5 `setup` and Effect Schema's `Type` are the shapes `Derivation` and
  `BodyCapture` follow.
