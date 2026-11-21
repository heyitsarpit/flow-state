---
review declared-schedules-inventory
status open 2026-11-22
---
# Declared schedules: where the old body-declared style still lives (2026-11-22)

**Inventory: 27 fixture sites, about 75 test sites in 27 files, 21 rows in `src/`, 8 Plan places, 10 Spec and
convention places, 0 docs or bench, 6 Task places.** The user's decision (2026-11-22) puts every schedule's name, key
fields, pause reasons
and `restartOn` Schema on the definition and drops `Flow.keyed`. The rewrite is wider than `Flow.keyed`: a body schedule
its definition does not declare is refused `ScheduleUndeclared` (@spec.Types I13), so every plain `schedules:` block
in the body now needs a `name: {}` declaration too. Read-only; nothing but this record was written.

Counts by area (a "site" is one body `schedules` entry or one `Flow.keyed` call):

| Area                    | Count                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- |
| 1 Fixtures              | 12 machine files, 21 body schedules (2 keyed, 3 with `restartOn`, 2 with `paused`) |
|                         | plus 6 planted shapes in 2 Story files                                             |
| 2 Tests                 | 9 `Flow.keyed` calls, about 65 plain body schedules in 27 files, 6 pinned types    |
| 3 Internal code         | 9 old-form symbols, 5 body inferences, 7 wide readers                              |
| 4 Plans                 | 8 places in 3 Plans                                                                |
| 5 Specs and conventions | 6 v3 places, 2 convention places, 4 core Specs (superseded, listed only)           |
| 6 Docs and bench        | 0 (`apps/docs/src/pages/concepts.md:12` says "schedules" of Effect only)           |
| 7 Open Tasks            | 6 places: T72, T109, T113, T89, T118 and a clean T129                              |

Conventions: "declare" means add `schedules: { name: { key?, pausedBy?, restartOn? } }` to the definition (`{}` when
plain); "body" means the machine body keeps `schedule`, `send`, `armOn`, `disarmOn`, `keys`, `restartOn`, `paused`.
Paths are under `packages/flow-state-v3/` unless they start with `wiki/` or `apps/`.

## 1. Fixtures

Keyed or reasoned machines (the declared form needs real content):

- `fixtures/home/machines/room.ts:147` | `poll: Flow.keyed({ keys, schedule, restartOn, paused: { Vacation, Saving },
  send })` | declare `poll: { key: { id: String }, pausedBy: ["Vacation", "Saving"], restartOn: kind Schema }`; drop
  `Flow.keyed`, keep the callbacks
- `fixtures/home/machines/room.ts:180` `check` | unkeyed, `restartOn: memory.target`, `paused: { Vacation }`, `armOn:
  [Flow.entry]` | declare `check: { pausedBy: ["Vacation"], restartOn: Schema.Number }`
- `fixtures/home/machines/room.ts:129` `reconnect`, `:188` `boost` | plain, `reconnect` an Effect series, `boost` has
  `disarmOn` | declare `reconnect: {}`, `boost: {}`
- `fixtures/home/stories/structure.ts:119` `armOnKeyed` | planted: `Flow.keyed` with `armOn` (refused `ArmOnKeyed`) |
  declare `poll` with a `key`; write it as a plain object; keep the refusal
- `fixtures/home/stories/structure.ts:139` `armedAndDisarmed` | planted: `boost` with `armOn` and `disarmOn` of one
  event | declare `boost: {}` or the shape refuses `ScheduleUndeclared` first
- `fixtures/home/stories/structure.ts:161` `armOnBesideRestart` | planted: `restartOn` in the body only | declare
  `boost: { restartOn: Schema.Number }`; else `RestartOnUndeclared` hides the finding

Plain machines (declare the name only; each is a body `schedules` entry the definition does not yet declare):

- `fixtures/home/machines/house.ts:30` | `homecoming` | declare `homecoming: {}` on `House` (`:7`)
- `fixtures/shop/machines/subscription.ts:39` | `renew` | declare `renew: {}`
- `fixtures/wizard/machines/booking.ts:58` | `expire`, `warn` | declare both
- `fixtures/number-input/machines/stepper.ts:184,192,199` | `delay`, `repeat`, `settle` | declare all three
- `fixtures/transfers/machines/transfers.ts:66` | `nudge` | declare `nudge: {}`
- `fixtures/sign-in/machines/sign-in.ts:109,117` | `cooldown`, `unlock` | declare both
- `fixtures/sign-in/machines/trusted-device.ts:55` | `reverify` | declare `reverify: {}`
- `fixtures/sync/machines/sync.ts:86` | `cool` | declare `cool: {}`
- `fixtures/services/shop/machines/pay.ts:306,358,376` | `slow`, `retry`, `check` | declare all three
- `fixtures/player/machines/player.ts:76` | `tick` | declare `tick: {}`
- `fixtures/player/machines/sleep-timer.ts:32` | `sleep` | declare `sleep: {}`
- `fixtures/sign-in/stories/structure.ts:195,219,237` | `reverify` planted bad delays (`{ day: 7 }`, NaN, infinity) |
  declare `reverify: {}` on the planted machine's definition, or the delay finding is shadowed

Stories and helpers that read schedule names or keys: none by string. Home Stories (`fixtures/home/stories/usual.ts`,
`load.ts`, `structure.ts`, `samples.ts`) take checkpoints of the whole snapshot, so they follow the snapshot's new type
with no edit. The names `poll`, `check`, `boost`, `reconnect` and the key `{ id }` are read only in tests (section 2).
The `"schedules":[]` strings in `fixtures/shop/stories/findings.ts:132,173,194` and
`fixtures/session/stories/values.ts:144,163,168` are saved records, not the declaration: no edit.

## 2. Tests

Rewrite needed in each: declare the schedule on the file's definition; for `Flow.keyed`, write the plain object.

- `tests/home/schedules.test.ts:407` | `remind: Flow.keyed({ keys })` | declare `remind` with its key; plain object
- `tests/home/schedules.test.ts:465,469` | `restartOn` in the body only | declare `restartOn` Schema
- `tests/home/schedules.test.ts:532,571,645-655` | plain schedules; one with `restartOn` and `paused` | declare names,
  reasons, Schema
- `tests/home/schedules.test.ts:35-42,86,106,110,281` | `held(id, left, pausedBy: ReadonlyArray<string>)` and a
  `key`-shaped timer helper | tighten to the declared reason union
- `tests/types/schedules.test-d.ts:38,77` | `poll: Flow.keyed({ ... })` | declared form; the `@ts-expect-error` at
  `:84` ("a keyed schedule is written with Flow.keyed") becomes a declaration check
- `tests/types/schedules.test-d.ts:55-59` | pins the wide key `Readonly<Record<string, string>>` ("today:") | invert:
  the key is `{ readonly id: string }` (T131's inverted pin)
- `tests/types/schedules.test-d.ts:102,134,171,200,223,243,265,282` | body `paused:` blocks, a bare `paused: () =>
  true` at `:287` | declare `pausedBy`; each probe becomes two-sided
- `tests/types/schedules.test-d.ts:296-302` | pins `Snapshot<typeof Room>["schedules"]` equal to the wide `Timers` |
  invert: `TimersOf<D>` with the reason union
- `tests/turn/schedule-sequences.test.ts:79,91` | two `Flow.keyed` branches (`keys`, `restartOn`, `paused`) | declared
  plain objects
- `tests/turn/schedule-keys-table.test.ts:67,533` | `t: Flow.keyed({ keys, paused: { A } })` | declare `t` with key `{
  id }`, `pausedBy: ["A"]`
- `tests/turn/schedule-table.test.ts:111,134,156,177-184,647,704-710` | five plain schedules with `restartOn` and
  `paused: { A, B }`, one `Flow.keyed` | declare `restartOn`, `pausedBy: ["A", "B"]`; key for `:178`
- `tests/turn/schedule-ledger.ts:306-311` | names the slots `states.ON.schedules.t.keys`/`restartOn` | no edit unless
  the slot path changes
- `tests/turn/creation.test.ts:29` | plain body schedule | declare
- `tests/compile/schedules.test.ts:44-90` | `restartOn`/`armOn` refusals, `paused: () => true` at `:83` | declare
- `tests/compile/schedules.test.ts:93-140` | R16 pair: "keys outside `Flow.keyed` are refused", help names
  `Flow.keyed` (`:111,114,140`) | delete both tests; the declared form's refusals live in
  `schedule-declarations.test.ts`
- `tests/compile/schedules.test.ts:151,172` | plain schedules | declare
- `tests/compile/schedule-send.test.ts:36,56` | plain; send mapper reads `key` | declare
- `tests/compile/construction.test.ts:405-408,430,538,641,662,757,930,959` | nine plain schedules, planted bad delays
  and `armOn: [5]`, `every: true` | declare, so the planted finding is the first one
- `tests/compile/corruption.test.ts:144,154,165` | three plain schedules with a corrupt value | declare
- `tests/types/machine.test-d.ts:63,71,133,145` | four plain schedules | declare
- `tests/types/endings.test-d.ts:270,278` | two plain schedules | declare
- `tests/types/nested-schedule.test-d.ts:20,37,54` | three plain schedules | declare
- `tests/types/schedule-send.test-d.ts:19,27,40,47` | four plain schedules; the send key typed `ScheduleKey` for an
  unkeyed one | declare; key is `undefined` (Types P3)
- `tests/surface/doors.test.ts:95` | one body schedule (a file T131 added; check it already declares) | verify only
- `tests/actors/snapshot.test.ts:29,109` | two plain schedules, snapshot names | declare
- `tests/write-lanes/write-ahead-records.test.ts:186` | plain `tick` with `armOn` | declare
- `tests/restore/schedule-edits.test.ts:76,158-218` | restored `restartOn` and `paused: { A }` added by edit
  (`:216-218`) | declare; an "edit" now edits the declaration too
- `tests/sign-in/trusted-device.test.ts:261` | reads `schedules: {}` of a snapshot | no edit
- `tests/timers.ts:39-57` | helper reads `pausedBy` as `unknown[]` | type to the declared union if a test needs it
- `tests/rules/records.ts:32,37`, `tests/rules/rules.test.ts:589`, `tests/rules/deliveries.ts:69-73` | saved-timer
  shape and the slot regex `schedules.<n>.(keys|restartOn|paused.*)` | check against the new slot paths; no edit if
  unchanged
- `src/core/turn.test.ts:20`, `src/host/runtime.test.ts:225` (in `src/`) | plain body schedules in unit tests |
  declare

Tests that run fixture machines and read names or keys without writing a schedule (no source edit, rerun after the
fixture change): `tests/player/player.test.ts`, `tests/wizard/booking.test.ts`, `tests/shop/store.test.ts`,
`tests/sync/repo.test.ts`, `tests/sign-in/trusted-device.test.ts`, `tests/stories/steps.test.ts`,
`tests/generated/profiles.test.ts`, `tests/restore/restore.test.ts`, `tests/restore/deep-inputs.test.ts`.
Fault harnesses that plant text from `src/` and must follow any rename: `tests/schedule-faults.ts`
(`:61,196,250,315-325`), `tests/actor-faults.ts:139`, `tests/construction-faults.ts`, `tests/restore-faults.ts`,
`tests/typed-core-faults.ts`.

Ignored as asked (T131, T120, commit `b890e923` and later): `tests/compile/schedule-declarations.test.ts`,
`tests/restore/schedule-declarations.test.ts`, `tests/types/schedule-declarations.test-d.ts`,
`tests/surface/doors.test.ts` (new parts), `tests/types/doors.test-d.ts`.

## 3. Internal code (`src/`)

Symbols that exist only for the old form:

- `flow.ts:308-313` | `Flow.keyed` (and its doc bullet `:264-266`) | delete
- `tokens.ts:223` | `ScheduleKey = Readonly<Record<string, string>>` | delete; the key type comes from the declaration
- `tokens.ts:261-295` | `ScheduleParts`, `ScheduleConfig` | replace with the declared-schedule body type (Types
  `DeclaredSchedules`)
- `tokens.ts:298-321` | `KeyedConfig`, `KeyedSchedule` (`"~flow": "keyed"`, `"~keyed"`) | delete
- `tokens.ts:330-366` | `ErasedSchedule`, `ErasedEntry`, `ScheduleEntry` | one erased type read from the declaration
- `definition.ts:107-115` | exports `KeyedConfig`, `KeyedSchedule`, `ScheduleKey` | drop from the public index
- `config.ts:226-236`, `:252`, `:464` | `ScheduleEntry` union with the `"keyed"` marker, its help text naming
  `Flow.keyed`, and `kindIs("keyed")` | decode a plain object; help text says "declare it on the definition"
- `compile-body.ts:326` | `is.keyed(entry) ? entry.config : entry` | read the entry as given
- `machine.ts:76,100` | `LeafBody<D>["schedules"]`, `ErasedEntry` record | typed by the declaration

Facts inferred from the body (the declaration becomes the one source):

- `compile-schedules.ts:81-87` | `config.keys !== undefined` decides "keyed" (`ArmOnKeyed`) | read keyed-ness from the
  declaration
- `compile-schedules.ts:155-160` | `onEntry` from `keys`/`restartOn`/`armOn` presence | from the declaration
- `compile-schedules.ts:164-181` | `restartOn`, `keys` and each `paused` reason collected from the body; the erase
  casts `:111,157,168,172,178` | reasons from `pausedBy`; selection and key codecs from the declaration; fewer casts
- `compile-schedules.ts:129-140`, `compile-names.ts:39` | `scheduleNames` built by placement (`DuplicateName`) | names
  come from the declaration; placement checks `ScheduleUndeclared`
- `core/compiled.ts:162-170,205-217,224-233` | `ScheduleInput.key: Values | undefined`, `FiringMetadata.key`,
  `restartOn: unknown`, `keys: Values[]`, `reason: string` | `Compiled.schedules` holds key and selection codecs and
  reasons (Types RT2)

Places that read a schedule name or key as `string` (snapshot, evidence, trace, saved timers):

- `host/snapshot.ts:75-98,121` | `Timers = Record<string, TimerView | keyed list>`, `pausedBy: ReadonlyArray<string>`,
  `Map<string, ...>` | `TimersOf<D>` with names, key and reasons from the declaration (Types RT3)
- `core/evidence.ts:134,139`, `core/evidence-of.ts:48,53` | `Paused`/`Resumed` carry `schedule: string`, `key:
  Option<Values>` | name union where the definition is known
- `core/world.ts:189,213,439,457,172-182` | `trackOf(name: string, ...)`, `schedules: Map<string, Tracked>`, firing
  mail `schedule: string`, `Tracked.pausedBy: string[]` | keep `string` inside the core; type at the edge only
- `core/vocabulary.ts:84-97` | `SavedTimer`: `name: String`, `key: Record<string, unknown>`, `pausedBy: Array<String>`
  | decode `key` through the declared codec on restore (T120)
- `host/trace.ts:112-139` | `keyText(key)`, `paused ${schedule}` lines | no change if the core keeps `string`
- `host/inspect.ts:133`, `core/schedule-restore.ts:109-116` | `live.schedules.get(track)`, `timer.pausedBy ?? []` |
  restore reads the declared codecs
- `core/persist.ts:105-107`, `core/schedule-plan.ts:148-166` | saved timers by name, `pausedBy` | follow the
  declaration

## 4. Plans (`wiki/plans/flow/*.plan`)

- `Machines.plan:428` | metadata "for a keyed schedule" key | say the declared `key`
- `Machines.plan:470-488` (Session example) | `idle` placed in the body with no declaration on `Session` (`:460-472`)
  | add `schedules: { idle: {} }` to the definition
- `Machines.plan:505-508` | "`paused: { Reason: ... }` names each reason ... `pausedBy` is typed" | the reasons are
  declared in `pausedBy`; the body keys the callbacks by them
- `Machines.plan:516-519` | "A keyed schedule's keys return key records ... `restartOn` is evaluated per key" |
  "keyed" now means declared with `key`
- `Machines.plan:822-823`, `:855-857` | "keyed schedules as keyed lists", V6 "keyed schedules" | wording only, names
  stay
- `CommandLine.plan:42-43` | explain shows "whether it declares `keys` and `restartOn`, and its pause reasons by name"
  | read from the definition's declaration
- `Inspection.plan:26` | Model "schedules (with keys and `restartOn` declared, and each pause reason by name)" |
  already declaration-shaped; confirm wording
- `Machines.plan:410-421` | O5 already edited today (declared form, `Flow.keyed` named as replaced) | none; line 417
  still lists `keys?` in the body, as the decision keeps it

Checked and clean: the toaster example `Machines.plan:561-600` and the carousel `:759-780` are in the declared form;
`Testing.plan:140-152`, `Persistence.plan:52-66` and `ServerRendering.plan:55` describe snapshots and records, which
the declaration does not change.

## 5. Specs and conventions

`wiki/specs/v3/`: the Specs already carry the declared form (another writer is editing them now). What still shows the
old form or its history:

- `Operations.md:236` | `after: schedules: { refresh: { schedule: "1 minute", send: E.Refresh } }`, a body schedule
  with no declaration | add `schedules: { refresh: {} }` to the definition line
- `Schedules.md:130-131` | fixture rows `room.ts` `poll`, `check`, `boost`, `reconnect` "keyed", `restartOn` on the
  kind | add "declared with `key` ..." to the row text
- `Schedules.md:184-185` | "Today" rows for `Schedule`/`ScheduleInput` and `snapshot.ts` | history; keep
- `Types.md:100-106,130,152-154` | family A/D rows, "Flow.keyed ... delete; used in 11 fixture and test files" |
  history of the delete; update the count (9 calls) when T120 lands
- `Types.md:384,393`, `Types.spec:791` | "fixture migration off `Flow.keyed`", "46 failing fixtures of the copy" |
  stays until the migration Task closes
- `Records.md:148` | "home (keyed `poll`, `pausedBy`, ...)" | fine; no edit

`wiki/conventions/`:

- `fixture-catalog.md:69` | feature row "`keys`, `paused`, `pausedBy`, `restartOn`, `disarmOn`" (2, U, 8, 4, 4 cells)
  | add `schedules` declaration as a feature, `Flow.keyed` is not named
- `fixture-catalog.md:455-456,1127-1129,1198,1308,1430` | "used today" and "step N" lists of `keys`, `paused`,
  `pausedBy`, `restartOn` per app | name the declaration beside them
- `fixture-catalog.md:68,185,448,536,687,959,993,1037` | "`schedules` with `armOn`" in "used today" | no edit; the
  feature stays, only the form changes
- `interaction-state.md:36` | example `PRESSING: { schedules: { hold: { schedule: "400 millis", send: E.Held } } ...}`
  | note the definition declares `hold: {}`

`wiki/specs/core/` (superseded; listed only, no edit): `Actors.spec`, `StaticCli.spec`, `Turn.spec`, `WriteAhead.spec`
(the other six core Specs have no schedule text). `Turn.spec` holds the old R14, R16, R27 wording.

## 6. Docs and bench

None. `apps/docs/` has no schedule API text (`src/pages/concepts.md:12` is Effect's `Schedule`); the generated files
need no edit. `bench/` holds no schedule or `Flow.keyed` use; its `benches/*.ts` run fixtures, so a fixture change
shows only as a rerun. The 50-key bench `turn.schedules.keyed-50` named in `P4.task:2728` does not exist yet.

## 7. Tasks (`wiki/tasks/V3/`)

Only `P3.task:313` (done, creation delays) and `P4.task` match; open Tasks with old-form text:

- `P4.task:719-723` | T72 (open) | toaster "`paused` ... `restartOn` selects ..., `keys` leave out loading toasts" |
  add "declared on `Toaster`"
- `P4.task:3425-3446` | T129 (draft) | "keyed schedules"; "no `Flow.keyed`" | fine; no edit
- `P4.task:2247-2254,2205` | T109 (draft) | snapshot timers typed "by the machine body (schedule names, keys,
  `pausedBy` as a literal union)" | by the definition; note the body route is superseded
- `P4.task:2487,2559-2562,2588-2593` | T113 (draft) | "typed by the body plus the definition: `pausedBy` ... body's
  pause reasons"; "unkeyed send mapper types `key` as `ScheduleKey`" | derive from the declaration (Types RT2, RT3)
- `P4.task:1026-1032,1047-1049,1066-1076,1093` | T89 (open) | its own rulings and review text on `Flow.keyed` going
  and restore tests declaring unkeyed schedules | already state the decision; stale lines at `:1093` ("needs the user"
  for `Flow.keyed`)
- `P4.task:2800-2906` | T118 (open) | order of checks, `restartOn` re-read on restore; blocked by T120 | wording
  stays; re-check once T120 lands

Done Tasks (`T57` at `:177-266`, `T58`) keep their old text as history. T120 (`:3038`, review) and T131 (`:3488`,
review) already speak the declared form; T120's `:3066` still says "11 `Flow.keyed` call sites" (inventory counts 9
calls: fixtures 2, tests 7).

## Supersede notes needed

Each is a sentence that records an old decision; give it a note that the user's 2026-11-22 decision supersedes it.
None is written here.

- `wiki/tasks/V3/P4.task:234` T57: "decided user 2026-11-20 `Flow.keyed` accepted as public API; it types `key` in
  `schedule`, `restartOn` ..." (also its done note `:225` "keyed schedules (`Flow.keyed`)").
- `wiki/tasks/V3/P4.task:1026-1027` T89: "Flow.keyed goes: the user's later decision 'No Flow.keyed'
  (@proposal.spec-handover, 2026-11-20, 'drop it') supersedes the earlier acceptance tag". It is a ruling about the
  earlier tag, so add one line that 2026-11-22 closes the question outright.
- `wiki/specs/v3/Schedules.spec:177-180` Q3 and `wiki/specs/v3/Schedules.md:263-264`: "the Plan's `Flow.keyed`
  wording is edited" (the outcome is already recorded; leave it).
- `wiki/specs/v3/Schedules.spec:153` and `:155`: "decided user 2026-11-20 `key` and `pausedBy` are in the
  declaration" and the 2026-11-21 `restartOn` Schema tag. These agree; the 2026-11-22 decision makes the body
  `Flow.keyed` route and body-declared names void, so state it beside them.
- `wiki/specs/v3/Types.spec:66-67`: the same two tags (2026-11-20 and 2026-11-21), and `Types.spec:139` Q4
  (2026-11-22, every declared reason has a callback in every placement) which already follows the decision.
- `wiki/plans/flow/Machines.plan:410-414` (O5): the Reverse clause "keep `Flow.keyed({ keys, ... })` and names declared
  in the body" is the old form; keep it as the Reverse, no edit.
- `wiki/plans/flow/Machines.plan:505-508`: "`paused` ... names each reason" (old: the body names the reasons).
- `wiki/plans/flow/Machines.plan:516-519`: "A keyed schedule's keys return key records ... `restartOn` is evaluated per
  key" (old: keyed-ness from the body's `keys`).
- `wiki/plans/flow/CommandLine.plan:42-43` and `wiki/plans/flow/Inspection.plan:26`: explain and the Model say whether a
  schedule "declares `keys` and `restartOn`"; the definition now declares them.
- `wiki/specs/core/Turn.spec` (R14, R16, R27 on `Flow.keyed`, body `keys`, `paused`) and `wiki/specs/core/Actors.spec`,
  `StaticCli.spec`, `WriteAhead.spec` (schedule text): superseded wholesale; no edit.
- `wiki/tasks/V3/P4.task:2253-2254` T109 and `:2487-2594` T113: the routed pins "pausedBy as a literal union in the
  snapshot" and "typed by the body" took the body route; the declaration route replaces it.
