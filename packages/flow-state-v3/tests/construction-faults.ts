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
        find: '      return raise(\n        flowErrorOf(\n          [\n            {\n              code: "Defect",\n              path: ["operations"],',
        replace:
          '      throw called.failure;\n    if (Result.isFailure(called))\n      return raise(\n        flowErrorOf(\n          [\n            {\n              code: "Defect",\n              path: ["operations"],',
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
        find: '      return raise(\n        flowErrorOf(\n          [\n            {\n              code: "Defect",\n              path: ["body"],',
        replace:
          '      throw written.failure;\n    if (Result.isFailure(written))\n      return raise(\n        flowErrorOf(\n          [\n            {\n              code: "Defect",\n              path: ["body"],',
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
        find: '    const read = madeOf("definition")(definition, ["definition"]);',
        replace: '    const read = Result.succeed({ owner: Symbol("unchecked") });',
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
        find: "    () => !Schema.is(schema)(value),",
        replace: "    () => false,",
      },
    ],
  },
  {
    name: "computed-start-accepted",
    tests: ["tests/turn/creation.test.ts"],
    says: "a function given to Flow.initial is judged as a constant, so it is refused only when its Schema refuses a function",
    rule: "Compile R5",
    edits: [
      {
        file: "src/construction.ts",
        find: "  if (Predicate.isFunction(value))",
        replace: "  if (Predicate.isFunction(value) && false)",
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
        find: '    if (ownerOf("guard", element) !== compile.owner)',
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
        find: '    if (ownerOf("action", a) !== compile.owner) {',
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
        find: "    if (!compile.sends.has(ending.value.token))",
        replace: "    if (ending.value.token === undefined)",
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
        find: '        invalid(\n          ["operations", name, ...place],\n          "WrongKind",',
        replace:
          '        invalid(\n          ["operations", name, ...place.join(".").split(".")],\n          "WrongKind",',
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
  {
    name: "bound-unchecked",
    tests: [CONSTRUCTION, STANDING_ORDER],
    says: "a partly built bound passes the operations decode",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/config.ts",
        find: "const Operations = Schema.Record(Schema.String, Bound).annotate({",
        replace: "const Operations = Schema.Record(Schema.String, Schema.Unknown).annotate({",
      },
    ],
  },
  {
    name: "ending-kind-unchecked",
    tests: [CONSTRUCTION, STANDING_ORDER, "tests/compile/corruption.test.ts"],
    says: "a hand-written ending passes the decode as a mapping",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/config.ts",
        find: '  madeKind("mapping", "Map with E.X.from(f) of the machine body\'s tokens."),',
        replace: "  Schema.Unknown,",
      },
    ],
  },
  {
    name: "event-payload-not-record-raw",
    tests: [CONSTRUCTION],
    says: "E.X given a payload that is no record throws a raw TypeError",
    rule: "Compile R14",
    edits: [
      {
        file: "src/events.ts",
        find: "!is(Predicate.hasProperty(given, name) ? given[name] : undefined)",
        replace: "!is(given[name])",
      },
    ],
  },
  {
    name: "send-untagged-raw",
    tests: ["src/host/runtime.test.ts"],
    says: "a send of null or a number throws a raw TypeError",
    rule: "Actors R14",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: '      if (!Predicate.hasProperty(event, "_tag") || !Predicate.isString(event._tag))',
        replace: "      if (event === event.constructor)",
      },
    ],
  },
  {
    name: "story-send-untagged-raw",
    tests: [STANDING_ORDER],
    says: "a Story step sending null throws a raw TypeError",
    rule: "Actors R14",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: '        if (!Predicate.hasProperty(event, "_tag") || !Predicate.isString(event._tag))',
        replace: "        if (event === event.constructor)",
      },
    ],
  },
  {
    name: "body-not-function-defect",
    tests: [CONSTRUCTION],
    says: "machine given no body function reports a Defect",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/machine.ts",
        find: "    if (!Predicate.isFunction(body))",
        replace: "    if (body === null)",
      },
    ],
  },
  {
    name: "payload-not-record-admitted",
    tests: ["tests/compile/corruption.test.ts"],
    says: "a field-less event admits a payload that is no record",
    rule: "Compile R14",
    edits: [
      {
        file: "src/core/boundary.ts",
        find: "  Predicate.isObject(given) &&\n  !Predicate.isFunction(given) &&\n  !Array.isArray(given) &&\n  walk.is(given)",
        replace: "  walk.is(given)",
      },
    ],
  },
  {
    name: "undefined-payload-as-none",
    tests: ["tests/compile/corruption.test.ts"],
    says: "E.X(undefined) is taken as no payload",
    rule: "Compile R14",
    edits: [
      {
        file: "src/events.ts",
        find: "    const given = args.length === 0 ? {} : args[0];",
        replace: "    const given = args[0] ?? {};",
      },
    ],
  },
  {
    name: "context-mixed-provider",
    tests: ["tests/shop/context.test.ts", "tests/actors/context-slots.test.ts"],
    says: "a derived slot whose reads name two providers is accepted, so it binds one of them and reads the other from the wrong actor",
    rule: "Compile R19",
    edits: [
      {
        file: "src/flow.ts",
        find: "    else if (first !== undefined && reader.value.owner !== first.reader.owner)",
        replace: "    else if (false)",
      },
    ],
  },
  {
    name: "reaction-event-unhandled",
    tests: ["tests/shop/context.test.ts"],
    says: "a reaction whose event no state handles is accepted, so each change it hears is denied unseen",
    rule: "Compile R19",
    edits: [
      {
        file: "src/machine.ts",
        find: "    if (!handles(tag))",
        replace: "    if (false)",
      },
    ],
  },
  {
    name: "context-read-not-token-accepted",
    tests: ["tests/actors/context-slots.test.ts"],
    says: "a derived read that is not a Flow token is dropped silently, so its select reads undefined",
    rule: "Compile R19",
    edits: [
      {
        file: "src/flow.ts",
        find: '    if (Option.isNone(reader)) findings.push(notAToken([...at, "reads", key]));',
        replace: "    if (Option.isNone(reader)) continue;",
      },
    ],
  },
  {
    name: "duplicate-reaction-accepted",
    tests: ["tests/actors/context-slots.test.ts"],
    says: "two reactions of one slot that send the same event are accepted, so their saved baselines cannot be told apart",
    rule: "Compile R19",
    edits: [
      {
        file: "src/machine.ts",
        find: "    if (twice)",
        replace: "    if (false)",
      },
    ],
  },
];
