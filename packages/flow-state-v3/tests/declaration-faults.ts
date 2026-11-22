import type { Fault } from "./faults.ts";

const DECLARATIONS = "tests/compile/schedule-declarations.test.ts";

const MIGRATION = "tests/compile/schedule-migration.test.ts";

const CONSTRUCTION = "tests/compile/construction.test.ts";

/**
 * Wrong checks of declared schedules: a placement its declaration refuses taken, and a key or
 * selection codec built wrong.
 */
export const declarationFaults: ReadonlyArray<Fault> = [
  {
    name: "schedule-undeclared-accepted",
    tests: [DECLARATIONS, MIGRATION],
    says: "a placed schedule its definition does not declare is accepted as a plain one",
    rule: "Types I13",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: "  if (Option.isNone(declared))\n    return [",
        replace: "  if (Option.isNone(declared) && Option.isSome(declared))\n    return [",
      },
      {
        file: "src/compile-schedules.ts",
        find: "  const decl = declared.value;",
        replace: "  const decl: ScheduleDecl = Option.getOrElse(declared, () => ({}));",
      },
    ],
  },
  {
    name: "reason-undeclared-accepted",
    tests: [DECLARATIONS],
    says: "a pause reason the declaration does not name is accepted",
    rule: "Types I13",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: "      .filter((r) => !reasons.includes(r))",
        replace: "      .filter(() => false)",
      },
    ],
  },
  {
    name: "reason-missing-by-in",
    tests: [DECLARATIONS],
    says: "a declared reason counts as placed when the placement inherits a member of its name, such as toString",
    rule: "Types I13, Q4",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: "      .filter((r) => Predicate.isObject(paused) && !Object.hasOwn(paused, r))",
        replace: "      .filter((r) => Predicate.isObject(paused) && !(r in paused))",
      },
    ],
  },
  {
    name: "keys-missing-accepted",
    tests: [DECLARATIONS],
    says: "a keyed declaration placed without keys is accepted",
    rule: "Types I13",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: '      decl.key !== undefined && !has("keys"),',
        replace: '      decl.key !== undefined && has("keys") && !has("keys"),',
      },
    ],
  },
  {
    name: "keys-unexpected-accepted",
    tests: [DECLARATIONS],
    says: "keys on a schedule declared without a key are accepted",
    rule: "Types I13",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: '      decl.key === undefined && has("keys"),',
        replace: '      decl.key === undefined && has("keys") && !has("keys"),',
      },
    ],
  },
  {
    name: "restart-on-undeclared-accepted",
    tests: [DECLARATIONS],
    says: "restartOn on a schedule declared without one is accepted",
    rule: "Types I13",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: '      decl.restartOn === undefined && has("restartOn"),',
        replace: '      decl.restartOn === undefined && has("restartOn") && !has("restartOn"),',
      },
    ],
  },
  {
    name: "restart-on-missing-accepted",
    tests: [DECLARATIONS],
    says: "a declared restartOn placed without one is accepted",
    rule: "Types I13",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: '      decl.restartOn !== undefined && !has("restartOn"),',
        replace: '      decl.restartOn !== undefined && has("restartOn") && !has("restartOn"),',
      },
    ],
  },
  {
    name: "key-codec-from-body",
    tests: [DECLARATIONS],
    says: "Compiled.schedules holds no key codec built from the declaration, so a saved key has nothing to decode through",
    rule: "Types I11",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: "        key: Option.map(Option.fromUndefinedOr(decl.key), keyCodecOf),",
        replace: "        key: Option.none(),",
      },
    ],
  },
  {
    name: "key-codec-lenient",
    tests: [DECLARATIONS],
    says: "a key codec decodes a saved key holding a field its declaration lost, so two saved keys merge into one",
    rule: "Schedules I14",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: "          [Schema.Record(other, Schema.Never)],",
        replace: "          [],",
      },
    ],
  },
  {
    name: "key-codec-declared-order",
    tests: [DECLARATIONS],
    says: "a key's text writes its fields in declaration order, so a reordered declaration names another timer",
    rule: "Schedules I14",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: "Object.fromEntries(Object.entries(fields).toSorted(([a], [b]) => byCodeUnits(a, b))),",
        replace: "Object.fromEntries(Object.entries(fields)),",
      },
    ],
  },
  {
    name: "warning-blocks-machine",
    tests: [DECLARATIONS],
    says: "a declared schedule placed nowhere refuses the machine instead of warning",
    rule: "Types I14",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: "  walk(body, []);\n\n  return found;",
        replace:
          '  walk(body, []);\n\n  const placed = JSON.stringify(body, (_, v: unknown) => (typeof v === "function" ? 0 : v));\n\n  for (const name of Object.keys(declared))\n    if (!placed.includes(`"${name}":`))\n      found.push(invalid(["schedules", name], "ScheduleUnplaced", name, name));\n\n  return found;',
      },
    ],
  },
  {
    name: "nested-placement-accepted",
    tests: [CONSTRUCTION],
    says: "one schedule placed in a state and in a state below it is accepted, two timers of one name active at once",
    rule: "Types R8",
    edits: [
      {
        file: "src/compile-schedules.ts",
        find: "  return placed.some((other) => atOrBelow(state, other) || atOrBelow(other, state))",
        replace: "  return placed.some(() => false)",
      },
    ],
  },
];
