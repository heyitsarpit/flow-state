# Codec strategy: brief for the prototype builder

Status: open question for the builder of the typed suite and the compile prototypes (HANDOFF, plan cut, steps 2 and 3). Arpit, 2026-11-04: the prototype decides this, not the coordinator. Nothing here is decided. The leads below come from a first look, and the builder should treat them as hypotheses to test, not as answers.

## The question

What is the simplest, most efficient way to get `Compiled` from the compiler to the runtime, and persisted records to and from the store? `Compiled` is a shape we know exactly and control fully. `JSON.parse(JSON.stringify(compiled))` plus a code table was the planned test, and it may be the wrong design.

## Options to build and compare

1. **No runtime codec for `Compiled`:** the compiler emits a TypeScript module, and Slots are imports of the real functions.
2. **A data form plus a code table:** JSON or a plain object, with Slots as definition paths, rebound at load. This is the old plan.
3. **A `Compiled` Schema** (Effect 4) as the codec, or only as the contract that checks 1 or 2.
4. **Anything better** the builder finds.

For Schemas inside `Compiled` (memory, inputs): import the user's export, emit code, or persist a representation.

## Leads to check, unverified

All in `node_modules/effect/src`, Effect 4.0.5 [read only, not run]:

- `Schema.toRepresentation` (`Schema.ts:16876`), `SchemaRepresentation.toJson` and `fromJson`, and `fromRepresentation(doc, { revivers })` (`SchemaRepresentation.ts:3063`): a Schema as data and back.
- `SchemaRepresentation.toCodeDocument` (`:2728`): generates TypeScript source from representations. Opaque declarations and leaf checks need `toCode` callbacks.
- `Schema.toJsonSchemaDocument` (`Schema.ts:17040`) for editors and agents. `Schema.toCodecJson` (`:17103`), which memory already uses, and `toCodecIso` (`:17149`).

## What to measure

- **Load cost** of each option: parse or evaluate, rebind Slots, and `seal`, for Pay, a fragment-heavy machine, and many machines.
- **Fidelity:** `Infinity`, `bigint`, `undefined` versus absent, Dates, shared object identity, and stray closures. Which option keeps each one, and which check catches each loss?
- **Bundle size,** gzip, against the current hand-written fixtures.
- **What tools need:** `flow check` and `explain` must read the data with every Slot poisoned and no callback run.
- **Drift:** which form makes "the suite runs on what production loads" true.
- **Persisted records:** a JSON string against the Schema-encoded object handed to IndexedDB for structured clone, measured in real Chrome and Safari, not only Bun. A rough Bun-only run (`codec/bench.ts`, not authoritative) had `structuredClone` of the object at 4-6 times `JSON.stringify`, and cloning a string almost free. Confirm or refute it in a browser.

## What to return

The chosen strategy, with numbers and the reasons for it, the options rejected and why, and what it changes in `Compiled`, the typed suite and the edge.
