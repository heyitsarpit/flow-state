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
        find: "return chainIn(compiled, handler).length;",
        replace: "return chainIn(compiled, handler).length - 1;",
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
        file: "src/core/walk.ts",
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
    tests: ["tests/transfers/transfers.test.ts", "tests/transfers/trace.test.ts"],
    says: "an accepted transition that changes nothing publishes nothing",
    rule: "Turn I9",
    edits: [
      {
        file: "src/core/change.ts",
        find: "    Turn: () => true,",
        replace: "    Turn: () => false,",
      },
    ],
  },
  {
    name: "refused-publishes-nothing",
    tests: ["tests/rules/refusal-window.test.ts"],
    says: "a refused event turn publishes no issue-only snapshot",
    rule: "Turn I14",
    edits: [
      {
        file: "src/core/change.ts",
        find: '    Refused: () => Option.some<Why>("Other"),',
        replace: "    Refused: () => Option.none<Why>(),",
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
        file: "src/core/schedule-plan.ts",
        find: "Number.isFinite(ms) && ms <= TIMER_LIMIT_MS",
        replace: "Number.isFinite(ms)",
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
        file: "src/compile-schedules.ts",
        find: "ms < 0 || ms > TIMER_LIMIT_MS",
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
        file: "src/error.ts",
        find: "  if (first !== undefined) raise(flowError([first, ...rest]));",
        replace: "  if (first !== undefined) raise(flowError([first]));",
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
        find: "    try: () => body(handed),",
        replace: "    try: () => {\n      body(handed);\n\n      return body(handed);\n    },",
      },
    ],
  },
  {
    name: "name-length-capped",
    tests: [CONSTRUCTION],
    says: "an authored name over 256 characters is refused InvalidName",
    rule: "Compile R4",
    edits: [
      {
        file: "src/construction.ts",
        find: '  if (name.length === 0) return Option.some("empty");',
        replace: '  if (name.length === 0 || name.length > 256) return Option.some("empty");',
      },
    ],
  },
  {
    name: "state-depth-capped",
    tests: [CONSTRUCTION],
    says: "a state deeper than ten levels is refused",
    rule: "Compile R4",
    edits: [
      {
        file: "src/construction.ts",
        find: "  const found = [...checkName(name, here)];",
        replace: '  const found = [...checkName(here.length > 12 ? "" : name, here)];',
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
        find: ".filter((k) => !names.has(k))",
        replace: ".filter(() => false)",
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
        find: "Predicate.isFunction(child) && !Schema.isSchema(child) && !allowed(parent, key);",
        replace:
          "Predicate.isFunction(child) && !Schema.isSchema(child) && !allowed(parent, key) && false;",
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
        find: "        Option.map(snapshotOf(driver, actor), (x) => outside(machine, x)),",
        replace: "        snapshotOf(driver, actor),",
      },
    ],
  },
  {
    name: "diagnostic-accepts-unknown-code",
    tests: [COMPILED],
    says: "the Diagnostic Schema decodes a code outside the closed list",
    rule: "Diagnostics R2, T1",
    edits: [
      {
        file: "src/error.ts",
        find: "  code: Code,",
        replace: "  code: Schema.String as unknown as typeof Code,",
      },
    ],
  },
  {
    name: "creation-delay-drops-all",
    tests: ["tests/turn/creation.test.ts"],
    says: "one refused delay at creation drops every schedule of the initial state, with no issue",
    rule: "Turn R14, T6",
    edits: [
      {
        file: "src/core/apply.ts",
        find: "                  disarms: [],",
        replace:
          '                  disarms: arms.some((a) => a.first._tag === "Failure") ? arms.map((a) => a.name) : [],',
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
        file: "src/core/schedules.ts",
        find: "      tx.refuse(incarnation.actor, issueOf(schedule.name, failure.key, failure));",
        replace: "      void issueOf(schedule.name, failure.key, failure);",
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
        file: "src/core/walk.ts",
        find: "  for (const path of (input.compiled.states.get(input.state)?.chain ?? []).slice(0, input.from))",
        replace: "  for (const path of input.compiled.states.get(input.state)?.chain ?? [])",
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
    name: "ending-to-undeclared-event",
    tests: [CONSTRUCTION],
    says: "an operation's ending mapped to an event the definition lacks is accepted",
    rule: "Compile R3",
    edits: [
      {
        file: "src/operation-checks.ts",
        find: "        Object.hasOwn(internal, event)\n          ? []",
        replace: "        true\n          ? []",
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
        file: "src/config.ts",
        find: "persist: Schema.optionalKey(Schema.Boolean.annotate(",
        replace: "persist: Schema.optionalKey(Schema.Unknown.annotate(",
      },
    ],
  },
  {
    name: "payload-of-any-kind",
    tests: [CONSTRUCTION],
    says: "an event whose payload is neither field Schemas nor Flow.uncertain(fields) is accepted",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/config.ts",
        find: "Schema.Record(Schema.String, Schema.Union([UncertainEvent, Payload]))",
        replace: "Schema.Record(Schema.String, Schema.Unknown)",
      },
    ],
  },
  {
    name: "context-of-any-kind",
    tests: [CONSTRUCTION],
    says: "a context slot that is not Flow.context's is accepted",
    rule: "Compile R4",
    edits: [
      {
        file: "src/config.ts",
        find: "context: Schema.optionalKey(Schema.Record(Schema.String, ContextSlot)),",
        replace: "context: Schema.optionalKey(Schema.Unknown),",
      },
    ],
  },
  {
    name: "handler-of-any-kind",
    tests: [CONSTRUCTION],
    says: "a handler that is null or a bare string is accepted",
    rule: "Compile R2, R4",
    edits: [
      {
        file: "src/config.ts",
        find: "Schema.UndefinedOr(Schema.Union([Handler, Schema.Array(Handler)])),",
        replace: "Schema.Unknown,",
      },
    ],
  },
  {
    name: "armon-of-any-kind",
    tests: [CONSTRUCTION],
    says: "an armOn element that is neither an event token nor Flow.entry is dropped",
    rule: "Compile R4",
    edits: [
      {
        file: "src/config.ts",
        find: "armOn: Schema.optionalKey(Schema.Array(Schema.Union([EventToken, EntryToken]))),",
        replace: "armOn: Schema.optionalKey(Schema.Array(Schema.Unknown)),",
      },
    ],
  },
  {
    name: "unknown-fields-ignored",
    tests: [CONSTRUCTION],
    says: "a field a definition, an alternative or a schedule does not have is ignored",
    rule: "Compile R4",
    edits: [
      {
        file: "src/config.ts",
        find: '{ onExcessProperty: "error", errors: "all" }',
        replace: '{ errors: "all" }',
      },
    ],
  },
  {
    name: "send-decodes-payload",
    tests: ["src/host/runtime.test.ts"],
    says: "send decodes a payload E.X built, so a transforming field it checked is refused",
    rule: "Actors R14, Compile R14",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "admitted(event.walk, event.names, payload)",
        replace: "Option.map(Schema.decodeUnknownOption(event.payload)(payload), () => payload)",
      },
      {
        file: "src/host/driver.ts",
        find: '  Result,\n} from "effect";',
        replace: '  Result,\n  Schema,\n} from "effect";',
      },
    ],
  },
  {
    name: "service-failure-outside-list",
    tests: ["src/host/runtime.test.ts"],
    says: "a failing services Layer is reported with a code outside the closed list",
    rule: "Diagnostics I5",
    edits: [
      {
        file: "src/host/setup.ts",
        find: '        code: "Defect",\n        path: ["services"],',
        replace: '        code: "ServiceFailed" as never,\n        path: ["services"],',
      },
    ],
  },
];
