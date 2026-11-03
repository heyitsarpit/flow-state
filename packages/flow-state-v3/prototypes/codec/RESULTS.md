# Codec strategy for `Compiled` and persisted records

Status: proposed. First research only, on 2026-11-04, Effect 4.0.5 (installed), Bun 1.4.2, this Mac. Marks: **[ran]**, **[read]**, **[reasoning]**. Arpit asked for the most efficient codec strategy and for it to go into the prototype.

## Recommendation

**1. `Compiled` has no runtime codec.** The compiler emits a TypeScript module, and the runtime imports it. Slots are imports of the real functions, so no code table exists at runtime, and values such as `Infinity`, `bigint`, and `undefined` versus absent survive exactly [reasoning].

```ts
// generated: pay.compiled.ts. NEW: compiler output, never edited by hand
import { guard_0, commit_1 } from "./pay.definition.ts"        // user-defined closures, imported where they are written

export const pay = {
  id: "Checkout/Pay",
  states: { CARD: { on: { Go: [{ target: "PAYING", guard: guard_0 }] } } },
  ops: { pay: { keyFields: ["intentId"], commit: commit_1, idleMs: Infinity } },
} satisfies Compiled                                               // existing: Compiled, now a checked contract
```

**2. Schemas inside `Compiled` are emitted as code too.** Effect 4 can turn a live Schema into a data representation and back, and can generate TypeScript source from that representation [read]:

- `Schema.toRepresentation(schema)` gives a structural document. `SchemaRepresentation.toJson` and `fromJson` persist it, and `fromRepresentation(doc, { revivers })` restores a Schema (`node_modules/effect/src/SchemaRepresentation.ts:3063`, with its own example at `:3040`).
- `SchemaRepresentation.toCodeDocument(multiDocument)` "generates TypeScript source for live schema representations" (`:2728`). Opaque declarations and leaf checks need `toCode` callbacks.

So the compiler can print a memory or input Schema as code beside the Slots. If a Schema is the user's own export, it imports it instead, which is simpler and the default [reasoning].

**3. A `Compiled` Schema is the contract, not a hot-path codec.** The same module is checked in dev and CI by decoding its data part through a `Compiled` Schema. That part has Slots replaced by their definition paths and Schemas by their representation. The check catches a stray closure, a shared object identity, or a lossy value, which is what the typed suite's `JSON.parse(JSON.stringify(...))` was meant to catch. `Schema.toJsonSchemaDocument` (`Schema.ts:17040`) can give editors and agents a JSON Schema of the same contract. The CLI reads that data form, so every Slot stays poisoned and no callback runs.

**4. Persisted records stay JSON strings, encoded off the turn, as the edge does now.** I first proposed handing IndexedDB the Schema-encoded object for structured clone, to save a serialization pass. **The numbers say no** [ran, `codec/bench.ts`; Bun's `structuredClone` stands in for the browser's serializer]:

| Record (chat memory) | `JSON.stringify` | `JSON.parse` | `structuredClone(object)` | `structuredClone(string)` |
| --- | --- | --- | --- | --- |
| 100 messages, 18 KB | 0.014 ms | 0.024 ms | 0.050 ms | 0.000 ms |
| 1,000, 177 KB | 0.107 ms | 0.208 ms | 0.472 ms | 0.000 ms |
| 10,000, 1.8 MB | 0.802 ms | 2.085 ms | 4.802 ms | 0.001 ms |

Structured clone of the object costs 4-6 times a `JSON.stringify`, while cloning a string costs almost nothing. IndexedDB's `put` clones whatever it is given, on the main thread, so a string is the cheapest thing to hand it. The record's format stays `Schema.toCodecJson` (memory already uses it), and that keeps Date, NaN and BigInt exact.

## What this changes in the plan (proposed)

- **Typed suite:** the suite imports the emitted module, the artifact production runs, instead of a JSON round trip. Plus the data-part decode through the `Compiled` Schema. This replaces step 2's "through JSON" (HANDOFF, plan cut).
- **Compile prototypes:** start with the module emitter. Printing an object literal with imports is small.
- **Persistence:** no change.

## Not checked

- The browser's own structured clone and IndexedDB `put` cost, on Chrome and Safari. The table above is Bun.
- Bundle size of a generated module against a compact data blob. A minifier usually closes the gap.
- `toCodeDocument` on the fixtures' real Schemas, such as `Schema.Date`, `Schema.BigInt` and the checks Pay uses: which need `toCode` callbacks.
- Whether `Compiled`'s data part can carry a Schema's representation without loss for `flow check`, given that brands are not in the AST (`Schema.ts:16868`).
