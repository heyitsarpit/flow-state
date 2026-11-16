import type { Fault } from "./faults.ts";

const PLAYER = "tests/player/player.test.ts";

const TREE = "src/core/tree.test.ts";

const CONSTRUCTION = "tests/compile/construction.test.ts";

const COMPILED = "tests/compile/compiled.test.ts";

/**
 * Wrong runtimes and compilers of a machine's structure: compound states, history, schedules on a
 * state's chain, late routing, publication, delays, construction refusals, the Runtime's check of
 * a Compiled, outside snapshots and the Diagnostic Schema; each planted alone like the others.
 */
export const structureFaults: ReadonlyArray<Fault> = [
  {
    name: "history-as-default",
    tests: [PLAYER, TREE],
    says: "a history target enters the compound's default leaf, forgetting its last active child",
    rule: "Turn R4",
    edits: [
      {
        file: "src/core/tree.ts",
        find: "Option.getOrElse(recorded, () => path),",
        replace: "path,",
      },
    ],
  },
  {
    name: "boundary-above-handler",
    tests: [TREE],
    says: "a handler targeting a state below it exits and re-enters its own state",
    rule: "Turn R3, model Boundary",
    edits: [
      {
        file: "src/core/tree.ts",
        find: "return chainOf(handler).length;",
        replace: "return chainOf(handler).length - 1;",
      },
    ],
  },
  {
    name: "implicit-self-shadows-root",
    tests: [PLAYER],
    says: "a schedule's armOn event is taken by the implicit self, so the root's handler never runs",
    rule: "Turn R14",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "return written ? levels : Option.toArray(implicit(input));",
        replace:
          "return Option.isSome(implicit(input)) ? Option.toArray(implicit(input)) : levels;",
      },
    ],
  },
  {
    name: "late-from-root",
    tests: [PLAYER],
    says: "a late ending is routed from the root, skipping the owner's surviving ancestors",
    rule: "Turn R20",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "onSome: (owner) => depthBelow(incarnation, owner),",
        replace: "onSome: () => 0,",
      },
    ],
  },
  {
    name: "accepted-publishes-on-change",
    tests: ["tests/transfers/transfers.test.ts"],
    says: "an accepted transition that changes nothing publishes nothing",
    rule: "Turn I9",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "publish(after);",
        replace:
          "if (after.memory !== incarnation.memory || after.state !== incarnation.state) publish(after);",
      },
    ],
  },
  {
    name: "refused-publishes-nothing",
    tests: ["tests/pay/pay.test.ts"],
    says: "a refused event turn publishes no issue-only snapshot",
    rule: "Turn I14",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "        publish(raised(incarnation, { source: route.source, code, slot: Option.some(slot) }));",
        replace:
          "        raised(incarnation, { source: route.source, code, slot: Option.some(slot) });",
      },
    ],
  },
  {
    name: "computed-delay-unbounded",
    tests: ["tests/turn/refusal.test.ts"],
    says: "a computed delay past 2^31 - 1 ms is armed",
    rule: "Turn R14, I14",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "value >= 0 && value <= MAX_DELAY_MS",
        replace: "value >= 0",
      },
    ],
  },
  {
    name: "fixed-delay-unbounded",
    tests: [CONSTRUCTION],
    says: "a fixed delay past 2^31 - 1 ms compiles",
    rule: "Turn R14",
    edits: [
      {
        file: "src/compile-body.ts",
        find: "ms < 0 || ms > MAX_DELAY_MS",
        replace: "ms < 0",
      },
    ],
  },
  {
    name: "construction-stops-at-first",
    tests: [CONSTRUCTION],
    says: "an invalid definition reports only its first violation",
    rule: "Compile R2, T2",
    edits: [
      {
        file: "src/definition.ts",
        find: "throw flowError([first, ...rest]);",
        replace: "throw flowError([first]);",
      },
    ],
  },
  {
    name: "callback-runs-twice",
    tests: [CONSTRUCTION],
    says: "machine runs its callback twice",
    rule: "Compile R1, T1",
    edits: [
      {
        file: "src/machine.ts",
        find: "const config = erasedBody(body({ S: definition.S, E: definition.E, O: definition.O }));",
        replace:
          "body({ S: definition.S, E: definition.E, O: definition.O });\n  const config = erasedBody(body({ S: definition.S, E: definition.E, O: definition.O }));",
      },
    ],
  },
  {
    name: "impure-default-accepted",
    tests: [CONSTRUCTION],
    says: "a default that is not a succeeded value is accepted",
    rule: "Compile R5, T3",
    edits: [
      {
        file: "src/construction.ts",
        find: "() => Option.isNone(pureDefault(field.ast)),",
        replace: "() => false,",
      },
    ],
  },
  {
    name: "added-state-accepted",
    tests: [CONSTRUCTION],
    says: "a body for a state the definition lacks is ignored",
    rule: "Compile R3, T11",
    edits: [
      {
        file: "src/compile-body.ts",
        find: "    if (!walk.children.some((c) => c.name === key))",
        replace: '    if (key === "~never")',
      },
    ],
  },
  {
    name: "identity-optional-accepted",
    tests: [CONSTRUCTION],
    says: "an optional, defaulted or number-encoded input field is accepted",
    rule: "Compile R7, T12",
    edits: [
      {
        file: "src/construction.ts",
        find: "() => !isIdentity(field.schema.ast),",
        replace: "() => false,",
      },
    ],
  },
  {
    name: "bare-function-accepted",
    tests: [COMPILED],
    says: "a Runtime boots a Compiled holding a function that is not a Slot",
    rule: "Compile R17, T8",
    edits: [
      {
        file: "src/core/well-formed.ts",
        find: "&& !allowed(value, key);",
        replace: "&& !allowed(value, key) && false;",
      },
    ],
  },
  {
    name: "private-fields-leak",
    tests: ["tests/turn/creation.test.ts"],
    says: "an actor's outside snapshot shows its Flow.private fields",
    rule: "Turn R23",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "getSnapshot: () => Option.map(snapshotOf(driver, actor), (x) => outside(machine, x)),",
        replace: "getSnapshot: () => snapshotOf(driver, actor),",
      },
    ],
  },
  {
    name: "diagnostic-accepts-unknown-code",
    tests: [COMPILED],
    says: "the Diagnostic Schema decodes a code outside the closed list",
    rule: "Diagnostics R2, T1",
    edits: [{ file: "src/error.ts", find: "  code: Code,", replace: "  code: Schema.String," }],
  },
  {
    name: "creation-skips-input-check",
    tests: [TREE],
    says: "creation copies an input field without checking it by its Schema's type side",
    rule: "Compile R6, T4",
    edits: [
      {
        file: "src/core/tree.ts",
        find: "Object.hasOwn(input, field.name) && field.is(input[field.name])",
        replace: "Object.hasOwn(input, field.name)",
      },
    ],
  },
  {
    name: "creation-delay-drops-all",
    tests: ["tests/turn/creation.test.ts"],
    says: "one refused delay at creation drops every schedule of the initial state",
    rule: "Turn R14, T6",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "return armSchedules({ ...bound, issues: [...bound.issues, ...issues] }, arm.armed);",
        replace:
          "return armSchedules({ ...bound, issues: [...bound.issues, ...issues] }, arm.refused.length > 0 ? [] : arm.armed);",
      },
    ],
  },
  {
    name: "creation-delay-silent",
    tests: ["tests/turn/creation.test.ts"],
    says: "a delay refused at creation reports no Issue evidence, though its snapshot keeps the issue",
    rule: "Turn R14, T6",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: '          tx.act(\n            Act.Refused({\n              code: "InvalidTurn",',
        replace: '          [\n            ({\n              code: "InvalidTurn",',
      },
      {
        file: "src/core/incarnations.ts",
        find: "              source: CREATION,\n              slot: Option.some(slot),\n            }),\n          );",
        replace:
          "              source: CREATION,\n              slot: Option.some(slot),\n            }),\n          ];",
      },
    ],
  },
  {
    name: "late-implicit-off-route",
    tests: ["src/core/turn.test.ts"],
    says: "a late ending reaches an implicit self below its route",
    rule: "Turn R14, R20",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "for (const path of chainOf(input.state).slice(0, input.from)) if",
        replace: "for (const path of chainOf(input.state)) if",
      },
    ],
  },
  {
    name: "history-before-the-move",
    tests: [TREE],
    says: "a history target taken from inside its compound reads the history from before the move",
    rule: "Turn R4",
    edits: [
      {
        file: "src/core/tree.ts",
        find: "const recorded = exits.includes(path)",
        replace: "const recorded = false",
      },
    ],
  },
  {
    name: "computed-reads-computed",
    tests: ["tests/turn/creation.test.ts"],
    says: "a computed start reads another computed field as absent and stores the result",
    rule: "Compile R5",
    edits: [
      {
        file: "src/core/tree.ts",
        find: ".map((f) => [f.name, { get: computedRead(f.name), enumerable: true }]),",
        replace: ".map((f) => [f.name, { get: () => undefined, enumerable: true }]),",
      },
    ],
  },
  {
    name: "ending-to-undeclared-event",
    tests: [CONSTRUCTION],
    says: "an operation's ending mapped to an event the definition lacks is accepted",
    rule: "Compile R3",
    edits: [
      {
        file: "src/operation-checks.ts",
        find: ".filter(([, e]) => !Object.hasOwn(internal, e.ending.event))",
        replace: ".filter(() => false)",
      },
    ],
  },
  {
    name: "key-outside-input-compiles",
    tests: [CONSTRUCTION],
    says: "an operation keyed outside its input compiles",
    rule: "Compile I16",
    edits: [
      {
        file: "src/operation-checks.ts",
        find: ".filter((key) => !names.includes(key))",
        replace: ".filter(() => false)",
      },
    ],
  },
  {
    name: "persist-of-any-kind",
    tests: [CONSTRUCTION],
    says: "a persist that is not a boolean is accepted",
    rule: "Compile R4",
    edits: [
      {
        file: "src/construction.ts",
        find: "return Predicate.isBoolean(value)",
        replace: "return true",
      },
    ],
  },
];
