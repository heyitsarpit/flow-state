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
        find: "  return Option.some(pairs);",
        replace: "  return Option.some([]);",
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
    rule: "Turn R24",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "host.freezeValues ? makeFreezer() : asItIs",
        replace: "asItIs",
      },
    ],
  },
  {
    name: "instances-compared-as-equal",
    tests: ["tests/session/deep.test.ts", "src/core/same.test.ts"],
    says: "the comparator holds every class instance (an Option, a Schema.Class) equal, so a changed Option selection is never heard",
    rule: "Codec R6",
    edits: [
      {
        file: "src/core/same.ts",
        find: "  return fieldPairs(a, b);",
        replace: "  return settled;",
      },
    ],
  },
  {
    name: "sparse-hole-ends-comparison",
    tests: ["src/core/same.test.ts"],
    says: "an array's pairs skip its holes, which leave holes on the stack, and a hole popped ends the comparison as equal",
    rule: "Codec R6",
    edits: [
      {
        file: "src/core/same.ts",
        find: "  for (let i = 0; i < a.length; i += 1) pairs.push([a[i], b[i]]);",
        replace:
          "  pairs.push(...a.map((x, i): Pair => [x, b[i]]));\n  pairs.length = a.length + 1;",
      },
      {
        file: "src/core/same.ts",
        find: "  while (stack.length > 0) {\n    const [a, b] = stack.pop() ?? [undefined, undefined];",
        replace:
          "  for (let p = stack.pop(); p !== undefined; p = stack.pop()) {\n    const [a, b] = p;",
      },
    ],
  },
  {
    name: "optional-key-context-dropped",
    tests: ["src/core/boundary.test.ts"],
    says: "a holed encoded node keeps the context from before its optional key, so a missing optional Date fails where Effect succeeds",
    rule: "Codec I8",
    edits: [
      {
        file: "src/core/boundary.ts",
        find: '  if (context === undefined || !Predicate.hasProperty(SchemaAST, "replaceContext")) return built;',
        replace: "  return built;",
      },
    ],
  },
  {
    name: "transformation-output-made-again",
    tests: ["tests/restore/deep-inputs.test.ts"],
    says: "a level parsed again runs its transformations again, so a parsed JSON string makes fresh values its holes never find and an actor named by a deep tree never starts",
    rule: "Codec R6",
    edits: [
      {
        file: "src/core/boundary.ts",
        find: "      if (Option.isNone(current) || current.value.budget > 0) return transform(input, options);",
        replace: "      return transform(input, options);",
      },
    ],
  },
  {
    name: "name-by-effect-encode",
    tests: ["tests/restore/deep-inputs.test.ts"],
    says: "an actor's name is encoded by Effect's recursive parser, so a ref 3,000 deep throws at ensure",
    rule: "Codec R4",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "    Result.flatMap(compiled.identity.encode(input), (encoded) =>",
        replace:
          '    Result.flatMap(Result.mapError(Schema.encodeUnknownResult(Schema.toCodecJson(nameSchemaOf(compiled.fields)))(input), () => "schema" as const), (encoded) =>',
      },
    ],
  },
];
