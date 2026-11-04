# Convergence 12: the review's fixes, `Compiled` settled once, and the compile prototypes

Status: **everything here is proposed.** The calls are the builder's, under delegation, for Arpit to overrule. Decisions start at D213. Inputs: `HANDOFF.md` (plan cut, step 3), `round-11/review.md` (the final review, advice), `round-11/RESULTS.md`, `convergence-11.md`, `round-11/api-changes.md`, `codec/BRIEF.md`, and the public API in `machine-design.md`.

Written in two parts: the review's fixes and the `Compiled` changes first (the checkpoint), then the compile prototypes.

## Findings, by root cause

| Root cause | What was assumed, and is false | Review findings |
| --- | --- | --- |
| **1. What the design states as data, `Compiled` held only as types or closures.** | That a fact the compiler knows and the Runtime does not need can stay type-only or inside a closure | H1 (requirements type-only, and erased by casts), M2 (memory as three closures), M3 (no input field list, so `keyFields` cannot be checked; a key closure beside it), Q3 (`events` optional) |
| **2. A refusal written is not a refusal pinned.** | That code that works by hand is covered | M1 (D207's two refusals, `legacy.ts`'s branches), L1 (F6's guard), L2 (rule 51, two machines' services), M2's computed initial |
| **3. The suite's hand data stands for production paths.** | That a hand machine pins a production path as well as a typed one | M5 (KeyRelease's rekey on a hand closure only), M4 (691 counts machines, not modules) |

## Decisions, proposed

| Id | Decision | Why | Replaces |
| --- | --- | --- | --- |
| **D213** | **Requirements are a contract's data, and the boot is typed by them.** A contract names its commit's services as values (`services: [ShopApi]`); a list that misses one of the commit's `R` leaves the contract with no `outcomes` (a type error at its use). It compiles to `Op.services`, the service keys. The Runtime's seal refuses an operation whose service the boot's context lacks (`SealMissingService`, by machine, operation and key). The boot's context is typed by the machine's `R` at the one erasure, `servicesFor(typed, context)`; the fixtures' casts are gone. A `Defect` issue carries its cause (`step.ts`) | H1: a missing service type-checked, ended as an unnamed `Defect`, and marked a write unknown that never left. Rule 57 says requirements are part of the summary, which Inspection prints, so they must exist as data. With the boot check, a commit cannot die for a service the boot lacks, so no write is marked unknown for it | D211's `Context<never>` casts; `provide` (review L7) |
| **D214** | **Memory as fields.** `Compiled.memory.fields`: each field's Schema, its one source (`input`, `initial`, `computed`, `absent`) and `private`. `initial`, `restore` and `encode` are required after the seal; the Runtime's branch for a memory with no restore is gone. Creation decodes the input: a present input field is checked by its Schema's type side (`InputRefused`), an absent one takes its decoding default, stays absent if optional, else is refused (`InputMissing`). **The restore rule for a field the record lacks** (a release added it): its decoding default; a constant initial; a computed initial run once over the restored fields (never for a field the record has); an optional key stays absent; an input with no default refuses the record (`RestoreMissingInput`), which the Runtime quarantines | M2: a release-added computed or input field restored as `undefined`, which fails its own Schema; the input was not decoded at creation (2.2.2 says it is). Q1: the runtime branch for no restore is taken only by hand data | D82's stand-in; D200's absent-input-as-`undefined` |
| **D215** | **One source for the key.** `Op.keyFields` and `Op.inputFields` (new) are data; the seal makes the key from `keyFields` and refuses a key field outside `inputFields` (`SealKeyField`), an op with both a key closure and `keyFields` (`SealKeyTwice`), and one with neither (`SealNoKey`). A compiler never writes `key`; the suite's hand data keeps its closure (F2), which the seal takes only from an op with no `keyFields`. `flow check` reports `KeyField`. The harness compiles again at the boot after a `release`, so a release can change data, not only closures | M3: `keyFields: ["nope"]` passed every check, and the key projected `{}`, so every input named one lane. M5: rekey after a key change had no typed pin | the `key` Slot from the compiler (D91's two sources) |
| **D216** | **`events` required.** The seal refuses a table without them (`SealIncomplete`); `legacy.ts` infers them for hand data, as `flow check` did | Q3: `flow check`'s verdict depended on an optional field |
| | `idleMs` for unbounded streams: not changed (D210 stands), left for the stream contract | Q3 |

## `Compiled` changes, made together

| Change | Where |
| --- | --- |
| `Op.services: string[]`, required after the seal | `fixtures/compiled.ts`; `round-12/gate.ts` `checkServices`; `driver.ts` passes the boot context's keys to `sealAll` |
| `Op.inputFields: string[]`; `Op.keyFields` the one key source; `Op.key` never from a compiler | `gate.ts` `keyOf`; `cli/check.ts` `KeyField`; `checks/front-check.ts` |
| `Memory.fields: Record<name, { source, schema, private? }>`; `restore`, `encode` required | `gate.ts` `sealMemory`; `durable.ts`, `record.ts` lose their fallbacks; `codec.ts` renders a field's Schema as JSON Schema |
| `events` required | `gate.ts` `seal` |
| `CompiledOutput`, `CompiledOp`, `CompiledMemory`, `CompiledFragment`: what a compiler emits, checked by `tsc` on the front end's return types | `fixtures/compiled.ts` |
| `CompiledData` (the data contract): `keyFields`, `inputFields`, `services`, `events`, memory `fields`, `restore`, `encode` required; `key` gone | `round-12/codec/codec.ts` |

The `Compiled` type keeps these optional for the suite's hand data, which `conformance/legacy.ts` completes before the seal; the seal and `CompiledData` are the contract, and `CompiledOutput` says it to a compiler.

## What failed decode means at each door

| Door | What decodes | A failure |
| --- | --- | --- |
| Creation (`ensure`, `useActor`) | the input, by the `Flow.input` fields (D214) | the creation is refused (`InputRefused`, `InputMissing`): the closure throws, the Runtime refuses the ensure as for any closure that throws, and no actor exists |
| Restore of an actor record | each stored field by its codec (`toCodecJson`), and the restore rule for a missing one | the record is quarantined (`RecordQuarantined`, D46); the actor starts fresh and the old bytes are not overwritten unread |
| Event admission | not in this prototype: `Compiled.events` holds names, not payload Schemas | stated as a gap. The design refuses a payload that fails its check before guards (2.2.1); a compile step owes `events` with payload Schemas |
| A commit's input at the door | its encodable form (D108, D124) | `NotSent` with the value kept for the mapper (D114); `flow check` names fields whose decoded form cannot go (`inputNotCarried`) |
| A lane's stored key and input | canonical form (D119) | the lane quarantines with its record |
| A mapper's output (an ending's payload) | the event's shape, by the gate's `plain` check | the turn is refused (`UserClosure`), and the ending is evidence |

