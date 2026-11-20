# Errors and construction trust: one door, one catalog (proposed, 2026-11-20)

**Bottom line:** the raw-throw class exists because being public and being checked are two separate, hand-applied
acts. Remove the freedom with three structures: every function Flow hands out is born through one of two doors
(`entry`, which hands its body only the decoded copy, and `capture`, which hands its body an unreadable box); every
Flow-made value is sealed by `made`, which refuses at construction any function in its public face that no door
made; and every refusal is built from one catalog that owns codes, closed reasons and classification. Issues stay
views of state; `IssueSource.Creation` is deleted. Everything here is proposed until the user accepts it.

Serves @task.V3.T100 (vocabulary, renderer, whole Causes) and @task.V3.T98 (construction trust). Builds on
[spec-cohesion](spec-cohesion-2026-11-20.md), [schedule-issues](schedule-issues-2026-11-20.md) and
[spec-saved-records](spec-saved-records-2026-11-20.md). Paths below are under `packages/flow-state-v3/`.

## 1. What exists

**Holds (reviewed, tested; keep):**

- `src/error.ts`: `Code` (23 closed literals), `Classification`, `Diagnostic` (a `Schema.TaggedError`, its own
  codec), `FlowError` (non-empty `diagnostics`), `flowError`, `flowErrorOf(findings, cause)`, `classify` (Defect if
  any die, else Failure, else Interruption: @plan.Diagnostics.O3's rule), `raise`, `refuse`.
- `src/entry.ts`: `entry` and `entryEffect` wrap a public function in `Result.try`; a non-FlowError throw becomes
  `Defect` at the function's name with the thrown value as `cause`. A `WeakMap` registry records each wrapper.
- `src/config.ts#findingsAgainst`: one `Schema.decodeUnknownResult` with `onExcessProperty: "error"`,
  `errors: "all"`, every issue turned into a `Finding` at its path. `core/boundary.ts#walkerOf` already fails a
  cycle (`Exit.die("cycle")`) for event payloads.
- `tests/surface/`: the walk of the root route and a hostile-value table; nine inverted (`it.fails`) tests titled
  by Diagnostics R1 hold the known instances red (`surface.test.ts` 181, 185, 191, 205; `tests/compile/`
  `authoring-gaps.test.ts` 53, 59, 65, 71, 83).
- `wiki/conventions/boundaries.md` (accepted by the user, 2026-11-18): one decode per source, entry or builder.

**Wrong or missing (each verified in code unless marked):**

| # | Gap | Where |
|---|-----|-------|
| G1 | A door is opt-in per function: functions inside inert data and the testing route are unwrapped | `definition.operations.x.textOfKey`, `O.x.commit(f).make`, `defineConfig` |
| G2 | `builder` runs its body with no catch, and nothing stops the body reading its arguments | `entry.ts#builder` |
| G3 | The decode's output is thrown away; the raw config is read again after the check | `definition.ts` 418 to 458, `machine.ts` (`bodyFindings`), `runtime.ts#runtimeSetup` |
| G4 | Flow-made values are recognised by a copyable mark (`~owner`, `~token`, `~flow`) | `machine.ts:273`, `tokens.ts`, `handles.ts`, `compile-body.ts`, `definition.ts` |
| G5 | `app` checks by hand; `transaction`, `resource`, `actorRef`, `layerIndexedDb` check nothing at the call | `core/well-formed.ts`, `contract.ts`, `host/refs.ts`, `host/platform/indexeddb.ts` |
| G6 | `details.reason` is a free `String`; about 28 reasons exist only as call-site text | `error.ts#Details`, `invalid(...)` |
| G7 | A store refusal has five names; the codec reason mapping is written twice | `StorageFailure`, `StorageSilent`, `StorageRefused`, `StoreRefused`, `forgetFailed`; `record-format.ts:25`, `boundary.ts:444` |
| G8 | No renderer; the CLI prints `Cause.pretty` | `host/cli/main.ts:135` |
| G9 | A Cause is squashed or dropped on five host paths (lead verifies each line) | `owners/schedule-steps.ts:27`, `driver.ts#resultOf`, `close.ts:147`, `run-promise.ts:56`, the `timeoutOrElse` race |
| G10 | `defect()` throws a raw `Error`; no `InvariantViolation` code; no `evidence` field | `core/defect.ts`, `error.ts` |
| G11 | `FlowError.code` is stored beside `diagnostics[0].code`, which determines it | `error.ts#FlowError` |
| G12 | The creation issue is appended once and nothing clears it | `core/incarnations.ts` 183 to 187, `IssueSource.Creation` |

## 2. State inventory

| State | States | Inputs that change it | Owner |
|-------|--------|-----------------------|-------|
| S1 Public registry: which functions and values Flow made | absent, `entry`, `effect`, `capture`, `made(kind)` | a door or `made` runs (write once, never removed) | `src/entry.ts` |
| S2 Trust of an outside value | `Unread`, `Admitted<A>`, refused | `admit(schema, at)` only | `src/admit.ts` (new) |
| S3 Vocabulary | static: code, reasons, defect flag | none at run time | `src/error.ts` |
| S4 A failure crossing cleanup | body Exit x cleanup Exits, then one FlowError | body ends, each cleanup ends or is overdue | `src/host/failures.ts` (new) |
| S5 Issues | none stored by this concept | n/a: a view | each neighbour's state; `issues-of.ts` |

S1, S2 and S3 each have one writer. S4 has two (the body's ending and the cleanups'), so it gets the table in 3.5.

**Seams.**

| Neighbour | I take | I give |
|-----------|--------|--------|
| Typed machine (TM) | the public function types (`derive.ts`): a door is given its public type and never infers it | `entry(name, args, run)`: `run` sees the admitted copy; `made`/`madeOf` in place of marks |
| Saved records (SR) | `Fate.Aside { reason }` and `Reason`'s tags, as given by `judge` | `RecordUndecodable`'s closed reasons are exactly `Reason`'s tags plus `ReadFailure`; `judge` never throws, so no door wraps it |
| Schedule issues, RO | `Failure { code, slot }`, `StoredIssue`, `issuesOf` | `IssueCode` and `issueOf` (Issue to Diagnostic); `IssueSource.Creation` removed from `StoredIssue` |
| Lifetimes (owners, close) | each owner's cleanup `Exit`, never a squashed value | `failureOf(body, cleanups)`: the one FlowError |
| Test tooling | the testing route's exports | the same two doors; the surface walk covers that route |

## 3. The design

### 3.1 The freedom, and the structure that removes it

Three findings in a row (T81, T94's sweep, T94's review) were one freedom: **a function can reach a caller, and a
body can read an outside value, without anything forcing a check between them.** `entry(...)` is applied by hand
at each export, the check and the use are separate statements over the same raw value, and "is this Flow's value"
is a property anyone can copy. Fixing instances adds wrappers; the next public function inherits the gap.

Removed by structure, not by more wrappers:

1. **Two doors, and nothing public exists outside them.** `made` builds every value Flow hands out and throws
   `InvariantViolation` at construction if its public face holds a function no door registered. An unwrapped
   function inside Flow data stops every test that builds a machine, not only the surface walk.
2. **The body never holds the raw value.** `entry`'s body receives only what `admit` returned; `capture`'s body
   receives `Unread`, a type with no readable member. There is no second read to forget.
3. **Identity, not marks.** `madeOf(kind)(value)` is `WeakMap` membership. A copied mark has nothing to copy.

### 3.2 Doors and sealed values

```ts
// src/entry.ts (after). existing: entry, entryEffect, registrationOf   renamed: builder -> capture
// NEW: Unread, made, madeOf     dropped: inert, raise as an export (it stays private to this file)

declare const Unread: unique symbol;
export type Unread = { readonly [Unread]: never };          // NEW: no member can be read

// existing, changed: takes the Schemas of its arguments; run sees the admitted copies only
export const entry = <F extends Callable>(name: string, args: ArgSchemas, run: (...admitted: Admitted) => unknown): F

// renamed from builder, changed: its body gets Unread and it now catches like entry
export const capture = <F extends Callable>(name: string, run: (...args: ReadonlyArray<Unread>) => unknown): F

// NEW: the only constructor of a value Flow hands out. face is frozen and public; internals live in a WeakMap.
export const made = <K extends Kind, Face extends object>(kind: K, face: Face, internals: InternalsOf<K>): Face
export const madeOf = <K extends Kind>(kind: K) => (value: unknown): Option.Option<InternalsOf<K>>
```

Before, a bound contract carried its own callables, so the walk had to stop at "inert" data:

```ts
// before: contract.ts hands out the functions the core calls
return builderResult({ kind: "write", contract: id, textOfKey, call, input, key, ... });
// user code can run: Keeper.operations.keep.textOfKey(null)   -> raw TypeError
```

```ts
// after: the face holds data only; what the core calls is reachable by identity alone
return made("bound", { kind: "write", contract: id }, { textOfKey, call, input, key, ... });
// core: const bound = madeOf("bound")(value)   // Option: None is WrongKind at that path, by admit
// user code: Keeper.operations.keep.textOfKey  -> undefined, nothing to call
```

A token that must stay callable (`E.X(payload)`, `O.x.commit(f)`) is itself a door: `E.X` an `entry` over the
event's walker, `O.x.commit` a `capture` whose result is `made("guard", {}, { args })`. `machine` reads those
args through `admit`, so `retryable(5)` and `retryable(undefined)` are refused `WrongKind` at the guard's path.

### 3.3 `admit`: decode whole, use the copy

```ts
// src/admit.ts (NEW). The only reader of an outside value.
export const admit = <S extends Schema.Constraint>(schema: S, at: Path) =>
  (value: Unread | unknown): Result.Result<S["Type"], readonly [Finding, ...Array<Finding>]>
```

Two steps, both total:

1. **Lift.** One walk reads each own enumerable property once into a plain copy. A getter or Proxy trap that
   throws is one `Defect` finding at that path with what it threw as the cause; a value met again on its own path
   is `InvalidConfiguration` reason `Cyclic`. The walk never calls a function and keeps by reference: functions,
   Effect Schemas, Flow-made values (`madeOf`), and frozen Maps, Sets and Dates (the user's Q20 B).
2. **Decode** the copy with the entry's one Schema (`onExcessProperty: "error"`, `errors: "all"`), issues mapped
   by today's `findingsOf`. Flow-made fields decode through `Schema.declare(madeOf(kind))`.

The lift is `walkerOf`'s walk if the lead finds it already reads once; otherwise a new 40-line walk. One of the
two, never both (T98's planted fault `decode-not-walker`).

```ts
// definition.ts, before                              // after
refuse(configFindings(config));                       export const definition: TM.DefinitionFn =
const internal = config.internalEvents ?? {};           entry("definition", [DefinitionConfig], (config) => {
const E = tokensOf(config.id, { ...config.events });      // config is the admitted copy; the raw one is gone
```

The public generic type comes from TM's `derive.ts`; the one cast from the erased admitted copy to it lives in
`entry`, where today's signature cast already is. `app`, `runtimeSetup`, `transaction`, `resource`, `actorRef`
and `layerIndexedDb` each get one Schema the same way; `well-formed.ts#appFindings` keeps only the cross-field
checks a Schema cannot say (duplicate ids), run on the admitted copy.

### 3.4 One catalog, one renderer

```ts
// src/error.ts (after). existing: Code, Classification, Diagnostic, FlowError, flowError, flowErrorOf
// NEW: CATALOG, Reason, finding      dropped: invalid(path, reason: string, ...), Details.reason as String
const CATALOG = {
  InvalidConfiguration: { defect: false, reasons: ["WrongKind", "ForeignToken", "DuplicateName", "Cyclic", /* … */] },
  StorageFailure:       { defect: false, reasons: ["quota", "closed", "aborted", "failed", "silent"] },
  RecordUndecodable:    { defect: false, reasons: [/* SR's Reason tags and ReadFailure */] },
  InvariantViolation:   { defect: true,  reasons: [] },     // NEW code (the user, 2026-11-19)
  Defect:               { defect: true,  reasons: [] },
  // … one row per code
} as const;

export const Code = Schema.Literals(keysOf(CATALOG));                   // derived, no second list
export const Reason = Schema.Literals(reasonsOf(CATALOG));              // closed; decoding refuses any other
export const finding = <C extends Code>(code: C, at: Path, reason: ReasonOf<C>, summary: string, help: string): Finding
```

- `Diagnostic` decodes `details.reason` by `Reason` and checks it is one of its code's reasons.
- `FlowError.code` becomes a getter over `diagnostics[0].code` (G11); `evidence` is added as
  `Option<ReadonlyArray<Evidence>>` (moved from T29; its content is the test tooling's).
- `core/defect.ts#defect(what)` raises `FlowError` `InvariantViolation`. The only `throw` statements left in
  `src/` are `error.ts#raise`, `core/frozen.ts#refuseWrite` (it mirrors a frozen object's native `TypeError`,
  thrown into the user's own callback) and `driver.ts`'s rethrow of a host callback (the user's Q21 A).
- **One name for a store refusal: `StorageFailure`.** The port's error class, the diagnostic and issue code, the
  evidence report (`StorageSilent` becomes reason `silent`) and the ending's `why`. `forgetFailed` is a call of
  `finding("StorageFailure", …)`. One `reasonOf(CodecFailure)` in `core/codec.ts`; `flow.ts#reasonOf` is another
  function (an error's `_tag`) and is renamed `tagOf`.

```ts
// src/render.ts (NEW, pure). Reads only Diagnostic's own Schema fields; never cause, never evidence.
export const render = (diagnostic: Diagnostic): string
export const renderAll = (error: FlowError): string
// InvalidConfiguration [WrongKind] at on.Flip.0.guard.0
//   the guard is not a guard token
//   help: Use O.save.retryable({ times }).
```

`escape` turns every C0 and C1 control, DEL, bidi override (U+202A to U+202E, U+2066 to U+2069) and lone
surrogate into `\u{…}`. Because details are closed scalars, the renderer never touches an object. Findings are
built only from admitted values, so no template calls a hostile `toString`. The CLI's `catchCause` prints
`renderAll` for a FlowError and one `Defect` diagnostic (path: the command) for anything else.

### 3.5 A failure crossing cleanup (S4): one table, owner `host/failures.ts#failureOf`

`failureOf(body: Exit, cleanups: ReadonlyArray<Exit>): Exit<A, FlowError>`. `cause` is always
`Cause.combine(body, ...cleanups)`; classification is `classify` of that whole Cause; nothing is squashed.

| Body \ cleanups | all clean | one or more fail or die | one overdue |
|-----------------|-----------|-------------------------|-------------|
| Success | success | `CleanupFailed`, the first cleanup primary, one diagnostic per failed cleanup in phase order | `CleanupFailed` reason `overdue` |
| Fail(FlowError e) | `e` | `e`'s diagnostics first, then one `CleanupFailed` each | same, reason `overdue` |
| Fail(other) or Die | `RunFailed` (or `Defect` at an entry) | that diagnostic first, then one `CleanupFailed` each | same |
| Interrupt | the interruption, untouched | `CleanupFailed` diagnostics; the interrupt stays in `cause` | same |

Rows come from R9 to R11. To feed it, every owner returns its cleanup's `Exit`: `stepOnce` returns the Exit
instead of throwing a squash; `resultOf` keeps `Died`'s cause; `close.ts` maps a store error into the Cause; a
cleanup raced by a timeout is awaited for its Exit, or reported overdue, never dropped as the race's loser.

### 3.6 Issues are views

No issue is stored by this concept. Creation arms its timers through the schedule decision (occasion `Created`),
so a refused delay is `Arming.Refused { failure }` on that timer and `scheduleIssues` derives it under
`IssueSource.Schedule { name, key }`. It clears when that timer next arms or leaves; `IssueSource.Creation` and
`withIssues` are deleted (built in @task.V3.T118, which already holds this item). The remaining stored sources
(`Event`, `Context`, `OnContext`) follow the same law in their owners' Tasks: the fact (a slot's last check
failed) lives in the owner's state, and `Incarnation.issues` is deleted when `StoredIssue` reaches `never`.

## 4. Requirements and Invariants

| Id | Rule | Source | The check that fails on a wrong build |
|----|------|--------|----------------------------------------|
| R1 | Every function reachable from either route, entering Flow-made values, is a door's. | @plan.Diagnostics.O1; T98 acceptance | surface walk of both routes; remove one door: the walk names the path |
| R2 | `made` refuses a face holding an unregistered function. | this design (3.1) | plant `raw-in-face`: every construction test fails `InvariantViolation` |
| R3 | A door's refusal is a FlowError; a non-FlowError throw is `Defect` with the thrown value as cause. | `entry.ts#refusalOf` | hostile-value table over every door, `capture` included |
| R4 | A `capture` body reads no argument: called with all-traps-throw Proxies it returns. | T98 acceptance | Proxy sweep over every `capture`; a type test: `Unread` has no members |
| R5 | An entry's body runs on the admitted copy: each own property of an argument is read exactly once. | boundaries.md; G3 | a counting getter on every config field reads 1; plant `reads-raw-again` |
| R6 | A throwing getter is one `Defect` carrying what it threw; a cycle is `InvalidConfiguration` `Cyclic`. | `authoring-gaps.test.ts` 71, 83 | those two inverted tests, un-inverted |
| R7 | A Flow-made value is accepted by identity only; a copied or forged look-alike is `WrongKind` at its path. | T98 acceptance; Q3 A | forge every kind by shape copy; grep: no `"~` in `src/` |
| R8 | `details.reason` is closed and legal for its code; `Diagnostic` decoding refuses any other. | @plan.Diagnostics.O1 | decode a Diagnostic per (code, foreign reason): rejected; `finding` type test |
| R9 | The reported `cause` is the combined Cause of the body and every cleanup. | @plan.Diagnostics.O3; Q7 A | body x cleanup matrix (3.5): `Cause` holds every planted failure |
| R10 | Execution or cancellation stays primary; cleanup-only failure makes the first cleanup primary. | @plan.Diagnostics.O3 | the same matrix asserts `diagnostics` order and count |
| R11 | A dying or overdue cleanup is always reported, raced or not. | Q11 A; T100 comment | a cleanup that dies inside a commit's timeout: `CleanupFailed` |
| R12 | Rendering keeps code, path, reason and help; escapes every control and bidi character; shows no input, stack, Cause or location. | @plan.Diagnostics.O4 | property test over hostile strings: output is printable ASCII plus escapes |
| R13 | CLI output holds no `Cause.pretty`, stack or fiber id. | T100 acceptance | CLI golden over a dying command; grep guard |
| R14 | A store refusal is named `StorageFailure` at every layer. | T100 acceptance | grep: the four other names are absent from `src/` |
| R15 | No issue is stored that state determines; a creation's refused delay clears when its timer arms. | the user (2026-11-20) | Story: create refused, re-enter and arm: issues `[]`; type: no `Creation` source |
| I1 | `Code`, `Reason` and the defect set are each derived from `CATALOG`; no second list. | G6, G7 | type test: a code outside `CATALOG` does not compile |
| I2 | `FlowError.code === diagnostics[0].code` always. | @plan.Diagnostics.O1 | holds by construction (getter); codec round-trip |
| I3 | `throw` appears in `src/` only at the three sites of 3.4. | boundaries.md | lint `throw-only-listed`, no disable comments left |
| I4 | A refused entry starts nothing and registers nothing. | `error.ts#refuse` doc | refuse `definition`, then build the same id: no `DuplicateName` |

Table 3.5's rows: columns from R11, row order from R10, the cause cell from R9.

## 5. Development strategy

1. **T100 first (owns S3, S4).** It needs no door. Order inside: `CATALOG` and `finding` with every call site
   moved (mechanical, type-driven), then `StorageFailure`, then `render` and the CLI, then `failureOf` and the
   five Cause paths. Risk: the raced cleanup (R11) sits in the lifetimes owner; settle the await-or-overdue shape
   with one spike on `owners.ts` before the table is coded.
2. **T98a doors (owns S1).** `made`, `madeOf`, `capture`, the testing route, marks removed. Spike first: `made`
   on `contract.ts`'s bound value only, with `surface.test.ts:181` un-inverted and the bench's construction row
   unchanged. Propose landing this before TM's `derive.ts`, so every later public function is born sealed.
3. **T98b admit (owns S2).** `admit` and one Schema per entry, `definition` first (it has five red tests), then
   `machine`, `app`, `runtimeSetup`, contracts, refs. Risk: the erased admitted copy against TM's generics.
4. **Creation issue:** T118 (schedule state), not here.

Split T98 in two because S1 and S2 have different owners and T98a unblocks every feature Task; keep T100 whole.

## 6. Testing strategy

- **Generator, not a list:** the hostile table is the product of (every door found by the walk) x (argument
  position) x (hostile value: `null`, `undefined`, a number, a throwing getter, a revoked Proxy, an
  all-traps-throw Proxy, a cycle, a forged look-alike of each Flow-made kind, a frozen Map, a 1 MB string). The
  expected ending comes from R3 to R7, never from running the code.
- **Dimensions missed before:** both routes; functions two levels inside made values; the same definition built
  twice (I4); a second app holding a look-alike of the first app's token (R7); doors called after `dispose`.
- **Cause matrix (3.5):** every body x cleanup cell, with two cleanups, under a timeout race and under load.
- **Renderer:** property test over strings drawn from controls, bidi marks, lone surrogates and ANSI sequences.
- **Planted faults:** `raw-in-face`, `reads-raw-again`, `capture-reads-early`, `token-by-shape`,
  `decode-not-walker`, `reason-free-text`, `render-no-escape`, `cause-squashed`, `cleanup-loser-dropped`.
- **Guards:** lint `throw-only-listed`; lint: `no-mark-probe` covers bracket reads; lint: `Cause.squash`,
  `Cause.pretty` and an error-ignoring `Effect.mapError` are refused in `src/host`; the `Unread` type test.
- **Bench:** construction of the largest fixture app and `E.X(payload)` per call, before and after `made` and
  `admit`; a turn's cost must not move (doors are not on the core's path).

## 7. Handoff for the Opus leads

**T100.** Read first: `src/error.ts`, `src/host/close.ts`, `src/host/owners/owners.ts`, `src/host/cli/main.ts`,
@plan.Diagnostics O1 to O4, this file 3.4 and 3.5. Decided: `CATALOG`, `finding`, `render`, `failureOf`,
`InvariantViolation`, `code` as a getter. Open before code: the full reason list per code (collect from every
`invalid(` call; SR's `Reason` tags); the Interrupt row's primary diagnostic (the Plan names cancellation
primary but no code for it exists: confirm, or keep the row above); whether `effect/Formatter` already offers a
total formatter (not verified here). First commit: R8 to R14 as failing tests plus the nine planted faults' rows.

**T98a.** Read first: `src/entry.ts`, `tests/surface/`, `src/contract.ts`, `src/tokens.ts`, `src/handles.ts`,
boundaries.md, this file 3.1 and 3.2. Decided: two doors, `made`, identity by `WeakMap`. Open: the `Kind` list
and each kind's face (with TM's lead); what the testing route's Story classes become (test tooling's call).
First commit: R1 to R4 and R7, the four `surface.test.ts` inversions removed, all red.

**T98b.** Read first: `src/config.ts`, `src/definition.ts`, `src/machine.ts`, `src/core/boundary.ts`, this file
3.3. Decided: lift then decode, the copy is used. Open: lift as `walkerOf` or new. First commit: R5, R6, I4 and
the five `authoring-gaps.test.ts` inversions removed, all red.

## 8. Proposed decisions, and the sidecar log

**PD1. A store refusal is `StorageFailure` at every layer, the ending's `why` included.** Trace A: a write is
refused for quota; the machine maps `NotSent { why: "StorageFailure" }`, the snapshot's issue and the trace say
`StorageFailure [quota]`. Trace B (today): the same event is `StorageRefused` to the machine, `StorageFailure`
in the snapshot and `StoreRefused` to the adapter author. Reverse: keep `why` as is and rename only the rest.

**PD2. Flow-made values are sealed: `textOfKey`, `call` and a token's `make` leave the public face.** Trace A:
`Keeper.operations.keep.textOfKey` is `undefined`; the core reaches it by identity. Trace B (today): the call
with `null` throws a raw `TypeError`. Reverse: keep them public and wrap each as an `entry`.

**PD3. `render` and `renderAll` are exported from the root route.** Trace A: an app logs
`renderAll(error)` and a machine named with an ANSI escape prints as `\u{1b}`. Trace B: the app prints
`error.message`, which carries the raw name. Reverse: keep them internal to the CLI.

**PD4. The CLI prints one `Defect` diagnostic, and no cause text, for a failure Flow did not make.** Trace A: a
config that dies prints `Defect at story` and exits 2. Trace B (today): it prints `Cause.pretty` with a stack.
Reverse: none inside @plan.Diagnostics.O3; a debug flag would need the Plan changed.

**PD5. Doors land before TM's `derive.ts`** (T98a moves up; T98b stays first in P5). Trace A: TM's new builders
are born through `capture` and `made`. Trace B: they are written with marks and rewritten by T98.

**Sidecar log** (three Haiku sidecars ran; the fourth, Effect prior art, was refused by the host's limit).

- Code inventory. Accepted after reading the code: `builder` has no catch; the decode output is discarded in
  `definition`; `Details.reason` is a free string; `Cause.pretty` at `cli/main.ts:135`; the squash at
  `schedule-steps.ts:27`. Changed: "three `reasonOf`" is two codec copies and one unrelated namesake in
  `flow.ts`. Accepted unverified, for the lead to confirm line by line: the Cause drops in `driver.ts`,
  `close.ts:147`, `run-promise.ts:56`, and the `trusted` casts in `contract.ts`.
- Review history. Accepted: T98's and T100's acceptance text, the nine inverted tests (seen in the files), the
  user's rulings Q19 to Q21, Q7, Q8. Accepted as a caution: the sentence "issues are derived from state
  everywhere" is in no record; the brief states it as the user's decision of 2026-11-20 and this design
  follows the brief. Accepted: T118 already holds the creation-time arming.
- Issues map. Accepted after grep: `CREATION` has one write and no clear. Rejected for this design: the host
  `quarantined` map as a stored issue; it is a fact with its own owner and clear (the user's Q8 A).
