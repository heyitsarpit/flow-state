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
        find: "export const encodeCanonical = (value: unknown) => writeCanonical(value);",
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
        find: 'Result.mapError(writeCanonical(json, "zero"), () => "codec"),\n      (text) =>',
        replace: 'Result.mapError(writeCanonical(json), () => "codec"),\n      (text) =>',
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
        find: "              ...selected,\n              raw: Option.some(raw),",
        replace:
          "              ...selected,\n              value: raw,\n              raw: Option.some(raw),",
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
    name: "walker-on-call-stack",
    tests: ["tests/session/deep.test.ts"],
    says: "the walkers follow every Schema.suspend on the call stack, so a folder tree 100,000 deep has no form and is never heard or saved",
    rule: "Codec R6",
    edits: [
      {
        file: "src/core/boundary.ts",
        find: "const BUDGET = 64;",
        replace: "const BUDGET = Number.POSITIVE_INFINITY;",
      },
    ],
  },
  {
    name: "structure-compared-shallow",
    tests: ["tests/session/deep.test.ts"],
    says: "the structural comparator holds two arrays of one length equal without their items, so a deeper nest is never heard",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/same.ts",
        find: "Option.some(a.map((x, i) => [x, b[i]] as const))",
        replace: "Option.some([])",
      },
    ],
  },
  {
    name: "selection-kept-by-default",
    tests: ["tests/session/deep.test.ts", "tests/session/values.test.ts"],
    says: "a slot keeps its last selection whatever its selector returns, so no change is heard",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/context.ts",
        find: "Option.exists(last.raw, (r) => r === raw)",
        replace: "Option.exists(last.raw, () => true)",
      },
    ],
  },
  {
    name: "admitted-values-unfrozen",
    tests: ["tests/turn/immutable.test.ts"],
    says: "a test host admits values unfrozen, so a machine that mutates its memory changes it in place and the memoised text goes stale",
    rule: "Pending D29",
    edits: [
      {
        file: "src/core/frozen.ts",
        find: "(freeze ? freezeDeep(value) : value)",
        replace: "value",
      },
    ],
  },
];
