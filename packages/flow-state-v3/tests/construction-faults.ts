import type { Fault } from "./faults.ts";

const CONSTRUCTION = "tests/compile/construction.test.ts";

const STANDING_ORDER = "tests/transfers/standing-order.test.ts";

const TRUSTED_DEVICE = "tests/sign-in/trusted-device.test.ts";

/**
 * Wrong compilers of a definition's and machine's configuration: a raw TypeError before the
 * decode, a decode that trusts what it should refuse, a foreign token taken by name, a callback's
 * throw that escapes raw, and a payload kept whole.
 */
export const constructionFaults: ReadonlyArray<Fault> = [
  {
    name: "definition-null-raw",
    tests: [CONSTRUCTION, STANDING_ORDER],
    says: "definition(null) throws a raw TypeError before its decode",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/definition.ts",
        find: "  const keys = Predicate.isObject(config) ? Object.keys(config) : [];",
        replace: "  const keys = Object.keys(config);",
      },
    ],
  },
  {
    name: "operations-record-unchecked",
    tests: [CONSTRUCTION, STANDING_ORDER, TRUSTED_DEVICE],
    says: "what the operations callback returns is trusted without its decode",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/definition.ts",
        find: "  const malformed = operationsFindings(called.success);",
        replace: "  const malformed = operationsFindings({});",
      },
    ],
  },
  {
    name: "operations-throw-raw",
    tests: [CONSTRUCTION],
    says: "an operations callback that throws escapes raw",
    rule: "Diagnostics R1, R6",
    edits: [
      {
        file: "src/definition.ts",
        find: '    throw flowErrorOf(\n      [\n        {\n          code: "Defect",\n          path: ["operations"],',
        replace:
          '    throw called.failure;\n  if (Result.isFailure(called))\n    throw flowErrorOf(\n      [\n        {\n          code: "Defect",\n          path: ["operations"],',
      },
    ],
  },
  {
    name: "body-throw-raw",
    tests: [CONSTRUCTION],
    says: "a machine body that throws escapes raw",
    rule: "Diagnostics R1, R6",
    edits: [
      {
        file: "src/machine.ts",
        find: '    throw flowErrorOf(\n      [\n        {\n          code: "Defect",\n          path: ["body"],',
        replace:
          '    throw written.failure;\n  if (Result.isFailure(written))\n    throw flowErrorOf(\n      [\n        {\n          code: "Defect",\n          path: ["body"],',
      },
    ],
  },
  {
    name: "machine-null-raw",
    tests: [CONSTRUCTION],
    says: "machine(null) reads the definition's tokens before checking it",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/machine.ts",
        find: '  if (!Predicate.hasProperty(definition, "~owner"))',
        replace: "  if (definition === undefined)",
      },
    ],
  },
  {
    name: "delay-object-unchecked",
    tests: [CONSTRUCTION, TRUSTED_DEVICE],
    says: "a fixed delay of any object, such as { sec: 5 }, is accepted",
    rule: "Compile R4",
    edits: [
      {
        file: "src/config.ts",
        find: "  DurationObject,\n]).annotate",
        replace: "  Schema.Unknown,\n]).annotate",
      },
    ],
  },
  {
    name: "constant-start-unchecked",
    tests: [CONSTRUCTION, STANDING_ORDER],
    says: "a constant start its field's Schema refuses is accepted",
    rule: "Compile R4, R5",
    edits: [
      {
        file: "src/construction.ts",
        find: "    () => !Schema.is(schema)(start.value),",
        replace: "    () => false,",
      },
    ],
  },
  {
    name: "foreign-guard-by-name",
    tests: [CONSTRUCTION],
    says: "a guard of another definition's operation of the same name is accepted",
    rule: "Compile R3",
    edits: [
      {
        file: "src/compile-body.ts",
        find: '    if (element["~owner"] !== compile.definition["~owner"])',
        replace: "    if (!Object.hasOwn(compile.definition.operations, element.operation))",
      },
    ],
  },
  {
    name: "foreign-action-by-name",
    tests: [CONSTRUCTION, STANDING_ORDER],
    says: "an action of another definition's operation of the same name is accepted",
    rule: "Compile R3",
    edits: [
      {
        file: "src/compile-body.ts",
        find: '    if (a["~owner"] !== compile.definition["~owner"]) {',
        replace: "    if (!Object.hasOwn(compile.definition.operations, a.operation)) {",
      },
    ],
  },
  {
    name: "reaction-event-unchecked",
    tests: [CONSTRUCTION, STANDING_ORDER],
    says: "an onContext event of another definition is accepted",
    rule: "Compile R3",
    edits: [
      {
        file: "src/machine.ts",
        find: "    if (!compile.sends.has(tokenOf(reaction.event)))",
        replace: "    if (tokenOf(reaction.event) === undefined)",
      },
    ],
  },
  {
    name: "dotted-tag-split",
    tests: [CONSTRUCTION],
    says: "a failure tag holding a dot is split into two path segments",
    rule: "Compile R2; Diagnostics R2",
    edits: [
      {
        file: "src/operation-checks.ts",
        find: '        ["operations", name, ...place],',
        replace: '        ["operations", name, ...place.join(".").split(".")],',
      },
    ],
  },
  {
    name: "mark-issue-per-key",
    tests: [TRUSTED_DEVICE],
    says: "a value without a slot's mark gives one finding per key",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/config.ts",
        find: "      all.issues.some(isMarkIssue)",
        replace: "      all.issues.some(isMarkIssue) && false",
      },
    ],
  },
  {
    name: "send-keeps-extra-keys",
    tests: ["src/host/runtime.test.ts"],
    says: "send hands the handler a payload's undeclared keys",
    rule: "Actors R14",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "admitted(event.walk, event.names, payload)",
        replace: "Option.map(admitted(event.walk, event.names, payload), () => payload)",
      },
    ],
  },
];
