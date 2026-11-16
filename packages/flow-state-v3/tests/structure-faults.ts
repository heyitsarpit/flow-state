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
        find: "History: () => leafOf(compiled, history.get(path) ?? path),",
        replace: "History: () => leafOf(compiled, path),",
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
        find: "tx.act(Act.Refused({ code, actor: incarnation.actor, ending: route.ending }));\n        publish(incarnation);",
        replace: "tx.act(Act.Refused({ code, actor: incarnation.actor, ending: route.ending }));",
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
    tests: [CONSTRUCTION],
    says: "an actor's outside snapshot shows its Flow.private fields",
    rule: "Turn R23",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "getSnapshot: () => Option.map(snapshotOf(driver, actor), (x) => outside(ref.machine, x)),",
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
];
