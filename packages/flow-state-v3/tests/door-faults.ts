import type { Fault } from "./faults.ts";

const DOORS = "tests/surface/doors.test.ts";

const CONSTRUCTION = "tests/compile/construction.test.ts";

/**
 * Wrong doors of construction trust: a copy, another owner's value or a throwing argument read
 * wrong, or a function on a face no door registered.
 */
export const doorFaults: ReadonlyArray<Fault> = [
  {
    name: "copy-taken-as-made",
    tests: [DOORS],
    says: "machine reads a definition by its fields, so a spread copy of one is taken as made",
    rule: "Operations R10",
    edits: [
      {
        file: "src/machine.ts",
        find: 'import { internalsOf, type KindOf, made, madeOf } from "./made.ts";',
        replace: 'import { internalsOf, type KindOf, made, madeOf, ownerOf } from "./made.ts";',
      },
      {
        file: "src/machine.ts",
        find: '    const read = madeOf("definition")(definition, ["definition"]);',
        replace:
          '    const read =\n      Predicate.hasProperty(definition, "S") && Predicate.isObject(definition.S)\n        ? Result.succeed({ owner: ownerOf("state", Object.values(definition.S)[0] ?? {}) })\n        : madeOf("definition")(definition, ["definition"]);',
      },
    ],
  },
  {
    name: "owner-compare-skipped",
    tests: [DOORS, CONSTRUCTION, "tests/actors/context-slots.test.ts"],
    says: "a door that names an owner takes another owner's made value",
    rule: "Operations R10",
    edits: [
      {
        file: "src/made.ts",
        find: "    if (Option.exists(owner, (own) => card.owner !== own))",
        replace: "    if (Option.exists(owner, () => false))",
      },
    ],
  },
  {
    name: "throw-at-call-name",
    tests: [DOORS],
    says: "an argument whose read throws escapes the door's reader, so its Defect names the call, not the argument",
    rule: "Operations R10",
    edits: [
      {
        file: "src/made.ts",
        find: "    if (Result.isFailure(read)) return Result.fail(defectAt(path));",
        replace: "    if (Result.isFailure(read)) throw read.failure;",
      },
    ],
  },
  {
    name: "raw-in-face",
    tests: [DOORS],
    says: "a machine carries its Compiled on its face, with the body's callbacks and the walkers no door registered",
    rule: "Operations I19",
    edits: [
      {
        file: "src/machine.ts",
        find: "    const face: Omit<Machine<D>, typeof KindOf> = { definition };",
        replace: "    const face: Omit<Machine<D>, typeof KindOf> = { definition, compiled };",
      },
    ],
  },
  {
    name: "second-copy-refused",
    tests: [DOORS],
    says: "the brand is an unregistered symbol, so a second loaded copy of Flow reads the first copy's values as copies",
    rule: "Operations R10, Q6",
    edits: [
      {
        file: "src/made.ts",
        find: 'export const MadeTypeId: unique symbol = Symbol.for("flow-state/Made");',
        replace: 'export const MadeTypeId: unique symbol = Symbol("flow-state/Made");',
      },
    ],
  },
  {
    name: "testing-route-unwrapped",
    tests: [DOORS, "tests/surface/surface.test.ts"],
    says: "the testing route's defineConfig is no door: given null it throws a raw TypeError",
    rule: "Operations R10, I19",
    edits: [
      {
        file: "src/host/testing/config.ts",
        find: 'export const defineConfig = entry(\n  "defineConfig",',
        replace: 'export const defineConfig = ((_: string, run: never) => run)(\n  "defineConfig",',
      },
    ],
  },
];
