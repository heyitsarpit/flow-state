import type { Fault } from "./faults.ts";

/**
 * Planted faults of the codec and of the values it carries: their canonical form, their depth and
 * their record formats, each with the tests that must catch it.
 */
export const codecFaults: ReadonlyArray<Fault> = [
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
  {
    name: "depth-unchecked",
    tests: ["tests/session/depth.test.ts"],
    says: "a value past the depth limit is walked by Effect's Schema anyway, so a recursive folder tree past it throws",
    rule: "Codec R1",
    edits: [
      {
        file: "src/core/depth.ts",
        find: "    if (depth > MAX_DEPTH) return false;",
        replace: "",
      },
    ],
  },
  {
    name: "deep-memory-equivalence-throws",
    tests: ["tests/session/values.test.ts"],
    says: "memory too deep for its Schema's equivalence throws out of the turn",
    rule: "Codec R4",
    edits: [
      {
        file: "src/machine.ts",
        find: "    Result.try(() => same(a, b)),",
        replace: "    Result.succeed(same(a, b)),",
      },
    ],
  },
  {
    name: "selection-depth-a-defect",
    tests: ["tests/session/depth.test.ts"],
    says: "a selection past the depth limit is raised as its selector's defect, not reported UnencodableValue",
    rule: "Codec R4",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    if (value.failure === DEPTH) {",
        replace: '    if (value.failure === DEPTH && slot === "~") {',
      },
    ],
  },
];
