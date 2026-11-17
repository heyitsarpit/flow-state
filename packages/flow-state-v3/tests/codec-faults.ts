import type { Fault } from "./faults.ts";

/**
 * Planted faults of the codec and of the values it carries: their canonical form, their depth and
 * their record formats, each with the tests that must catch it.
 */
export const codecFaults: ReadonlyArray<Fault> = [
  {
    name: "deep-selection-compared-by-equal",
    tests: ["tests/session/values.test.ts"],
    says: "a selection too deep for Equal is compared by Equal alone, so a reload of a 100,000-deep document throws",
    rule: "Codec R1",
    edits: [
      {
        file: "src/core/slots.ts",
        find: '  Result.getOrElse(Result.try({ try: () => Equal.equals(a, b), catch: () => "deep" }), () =>',
        replace: "  Result.getOrElse(Result.succeed(Equal.equals(a, b)), () =>",
      },
    ],
  },
  {
    name: "deep-memory-compared-by-schema",
    tests: ["tests/session/values.test.ts"],
    says: "memory too deep for its Schema's equivalence is compared by it alone, so pasting a 100,000-deep document throws",
    rule: "Codec R1",
    edits: [
      {
        file: "src/machine.ts",
        find: "    sameMemory: deepSafe(Schema.toEquivalence(memory), codecOf<Values>(Schema.toCodecJson(memory))),",
        replace: "    sameMemory: Schema.toEquivalence(memory),",
      },
    ],
  },
  {
    name: "codec-text-by-stringify",
    tests: ["src/core/codec.test.ts"],
    says: "canonical text is written by the host's recursive JSON.stringify, so a value 100,000 deep throws",
    rule: "Codec R1",
    edits: [
      {
        file: "src/core/codec.ts",
        find: "export const encodeCanonical = (value: unknown) => Result.map(toCanonicalJson(value), toText);",
        replace:
          "export const encodeCanonical = (value: unknown) => Result.map(toCanonicalJson(value), (j) => JSON.stringify(j));",
      },
    ],
  },
  {
    name: "negative-zero-refused",
    tests: ["tests/session/values.test.ts"],
    says: "a -0 selection is refused as its selector's defect, so the digest never hears its count reach zero",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/slots.ts",
        find: 'toCanonicalJson(json, "zero")',
        replace: "toCanonicalJson(json)",
      },
    ],
  },
  {
    name: "selection-kept-raw",
    tests: ["tests/session/values.test.ts", "tests/rules/reloads.test.ts"],
    says: "a live slot keeps the selector's raw value, not the one its Schema reads back, so a reload compares a different value and makes up an onContext event",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/slots.ts",
        find: "            (canonical) => readSelected(codec, canonical),",
        replace: "            (canonical) => Result.succeed({ value: raw, json: canonical }),",
      },
    ],
  },
  {
    name: "step-two-drops-copies",
    tests: ["src/core/actor-record.test.ts"],
    says: "the format-2 step drops each baseline's memory copy, so its baseline reads the record's own memory",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/actor-record.ts",
        find: "        return { slots: frame.slots, memory: memories.push(frame.memory) - 1 };",
        replace: "        return { slots: frame.slots, memory: null };",
      },
    ],
  },
];
