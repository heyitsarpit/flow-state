import type { Fault } from "./faults.ts";

const RESTORE = "tests/restore/restore.test.ts";
const FORGED = "tests/restore/forged.test.ts";
const RECORDS = "tests/restore/records.test.ts";

/**
 * Wrong runtimes for reading saved records: a format, key, name, contract, key text, state,
 * schedule, Attempt, binding, input digest, memory input or slot read without its check, a lane or
 * row of an operation the machine never writes, an ending owed twice or with no Attempt, and a
 * record of an undeclared machine kept or a lane of one discarded.
 */
export const recordFaults: ReadonlyArray<Fault> = [
  {
    name: "local-name-restored",
    tests: [RESTORE],
    says: "a record under a local actor's name restores and wakes an actor",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: '  if (isLocalName(name)) return Result.fail("name");',
        replace: "  if (isLocalName(name)) return Result.succeed({});",
      },
    ],
  },
  {
    name: "record-key-unchecked",
    tests: [RESTORE],
    says: "a record restores under a key whose name does not name itself back, as the identity its input names",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: 'again === name ? Result.succeed<Values>({ ...input }) : Result.fail("other"),',
        replace: "Result.succeed<Values>({ ...input }),",
      },
    ],
  },
  {
    name: "record-name-unread",
    tests: [RESTORE],
    says: "a record restores under a name its machine's identity cannot read",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "        Option.filter(unescapeSegment(text.slice(compiled.id.length + 1)), (n) =>\n          Result.isSuccess(decodeName(compiled, n)),\n        ),",
        replace: "        unescapeSegment(text.slice(compiled.id.length + 1)),",
      },
    ],
  },
  {
    name: "record-machine-unread",
    tests: [RESTORE],
    says: "a record of a machine no entry declares is discarded whatever its kind, so a lane's hold is lost",
    rule: "Restore R8",
    edits: [
      {
        file: "src/core/record.ts",
        find: 'parts.failure === "machine" && Option.contains(kind, "actor")',
        replace: 'parts.failure === "machine"',
      },
    ],
  },
  {
    name: "lane-operation-unkeyed",
    tests: [RESTORE, FORGED],
    says: "a lane record restores under a key naming a contract its machine does not write",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: '[...compiled.operations.values()].find((o) => o._tag === "Write" && o.contract === c),',
        replace: '[...compiled.operations.values()].find((o) => o._tag === "Write"),',
      },
    ],
  },
  {
    name: "lane-key-text-unread",
    tests: [RESTORE],
    says: "a lane key's text is never read, so a headless lane under any text restores",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "onSome: (o) => Result.map(keyNamesItself(o, keyText), () => ({ operation: o, keyText })),",
        replace: "onSome: (o) => Result.succeed({ operation: o, keyText }),",
      },
    ],
  },
  {
    name: "held-lane-other-key",
    tests: [RESTORE],
    says: "a Held head restores under a key its input does not name",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "            Option.contains(keyTextOf(operation, record.input), keyText) &&",
        replace: "            true &&",
      },
    ],
  },
  {
    name: "owed-row-operation-unread",
    tests: [RESTORE],
    says: "an owed row of an operation its machine does not declare is read",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "Schema.makeFilter((name: string) => compiled.operations.has(name))",
        replace: "Schema.makeFilter((_: string) => true)",
      },
    ],
  },
  {
    name: "owed-row-other-lane",
    tests: [RESTORE, FORGED],
    says: "an owed row naming a lane by a contract or key text its machine never gives is read",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "Schema.makeFilter((tail: string) => Result.isSuccess(laneTailParts(compiled, tail))),",
        replace: "Schema.makeFilter((_: string) => true),",
      },
    ],
  },
  {
    name: "binding-unchecked",
    tests: [FORGED],
    says: "an actor record's context binding is read as any name of any machine, so an owing identity binds what its record names",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/actor-record.ts",
        find: "  exact({ machine: Schema.Literal(compiled.id), name: actorNameOf(compiled) });",
        replace: "  exact({ machine: Schema.String, name: Schema.String });",
      },
    ],
  },
  {
    name: "state-unchecked",
    tests: [FORGED],
    says: "an actor record's state is read as any text, so an actor restores in a state its machine lacks",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "Schema.makeFilter((path: string) => compiled.states.get(path)?.children.length === 0),",
        replace: "Schema.makeFilter((_: string) => true),",
      },
    ],
  },
  {
    name: "schedule-unchecked",
    tests: [FORGED],
    says: "an actor record's schedules are read by any name, so a timer its machine never declared arms",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/actor-record.ts",
        find: "exact({ name: Schema.Literal(s.name), dueAt: Instant, send: Schema.Literal(s.send) }),",
        replace: "exact({ name: Schema.String, dueAt: Instant, send: Schema.String }),",
      },
    ],
  },
  {
    name: "attempt-unchecked",
    tests: [FORGED],
    says: "a lane record's Attempt is read as any text, so a forged Attempt is heard",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "Schema.isPattern(/^att-[\\da-f]+-[1-9]\\d*$/u),",
        replace: "Schema.makeFilter((_: string) => true),",
      },
    ],
  },
  {
    name: "input-digest-unchecked",
    tests: [RECORDS],
    says: "a Held head's input is read without its digest, so an input changed on disk that keeps its key text is re-sent under the same Attempt",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "            ) === record.digest)),",
        replace: "            ) !== undefined)),",
      },
    ],
  },
  {
    name: "undeclared-machine-kept",
    tests: [FORGED],
    says: "an actor record of a machine no entry declares is quarantined and kept, not discarded with a diagnostic",
    rule: "Restore R8",
    edits: [
      {
        file: "src/core/record.ts",
        find: "      discarded.push(key);\n      continue;",
        replace: '      quarantined.push({ key, kind, reason: "machine" });\n      continue;',
      },
    ],
  },
  {
    name: "null-format-read-as-current",
    tests: [RESTORE],
    says: "a lane record whose format is null is read as the current format",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "    format: Schema.Literal(FORMAT),\n    attempt: AttemptIdSchema,",
        replace:
          "    format: Schema.NullOr(Schema.Literal(FORMAT)),\n    attempt: AttemptIdSchema,",
      },
    ],
  },
  {
    name: "newer-format-read",
    tests: [RESTORE],
    says: "a lane record of any numeric format is read, a newer or fractional one included",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "    format: Schema.Literal(FORMAT),\n    attempt: AttemptIdSchema,",
        replace: "    format: Schema.Number,\n    attempt: AttemptIdSchema,",
      },
    ],
  },
  {
    name: "memory-input-unchecked",
    tests: [RESTORE],
    says: "an actor record whose memory's input fields name another actor restores under its key, as that other actor",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "  Result.getOrUndefined(nameOfValue(compiled, memory)) === name;",
        replace: "  Result.isSuccess(nameOfValue(compiled, memory));",
      },
    ],
  },
  {
    name: "owed-ending-repeated-read",
    tests: [FORGED],
    says: "an owed record holding one Attempt's success twice is read, so the success is heard twice",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "        return new Set(ended).size === ended.length;",
        replace: "        return ended.length >= 0;",
      },
    ],
  },
  {
    name: "owed-success-unattempted-read",
    tests: [FORGED],
    says: "an answered row with no Attempt is read, so a success nobody sent is heard",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: '        lane,\n        attempt: AttemptIdSchema,\n        channel: Schema.Literals(["success", "failure", "unknown"]),',
        replace:
          '        lane,\n        attempt: Schema.optionalKey(AttemptIdSchema),\n        channel: Schema.Literals(["success", "failure", "unknown"]),',
      },
    ],
  },
  {
    name: "displaced-repeated-read",
    tests: [FORGED],
    says: "a lane record listing one displaced Attempt twice is read, so its unknown is heard twice",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "        new Set(record.displaced).size === record.displaced.length &&",
        replace: "        record.displaced.length >= 0 &&",
      },
    ],
  },
  {
    name: "seen-slot-dropped",
    tests: [FORGED],
    says: "an actor record remembering a slot its machine never declared is read with the slot dropped",
    rule: "Codec R5",
    edits: [
      {
        file: "src/core/actor-record.ts",
        find: "    seen: bySlot(compiled, Schema.Json),",
        replace: "    seen: Schema.Record(Schema.String, Schema.Json),",
      },
    ],
  },
  {
    name: "owed-row-fields-widened",
    tests: [FORGED],
    says: "a store's refusal row is read whatever channel, reason and value it also holds",
    rule: "WriteAhead R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: '        _tag: Schema.Literal("Refused"),\n        operation,\n        attempt: AttemptIdSchema,',
        replace:
          '        _tag: Schema.Literal("Refused"),\n        operation,\n        attempt: AttemptIdSchema,\n        channel: Schema.optionalKey(Schema.String),\n        reason: Schema.optionalKey(Schema.String),\n        value: Schema.optionalKey(Schema.Json),',
      },
    ],
  },
  {
    name: "unsent-reason-unchecked",
    tests: [FORGED],
    says: "a NotSent row on a lane is read with any reason, so a why no cell gives is heard",
    rule: "WriteAhead R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "        reason: NotSentWhy,",
        replace: "        reason: Schema.String,",
      },
    ],
  },
  {
    name: "answered-lane-less-read",
    tests: [FORGED],
    says: "an answered row with an Attempt and no lane is read as its operation's, so a success nobody owed is heard",
    rule: "WriteLanes R10",
    edits: [
      {
        file: "src/core/record.ts",
        find: '        _tag: Schema.Literal("Answered"),\n        lane,',
        replace:
          '        _tag: Schema.Literal("Answered"),\n        lane: Schema.optionalKey(lane),\n        operation: Schema.optionalKey(operation),',
      },
      {
        file: "src/core/record.ts",
        find: "            ...onLane(a.lane, a.attempt),",
        replace:
          "            ...(a.lane === undefined\n              ? { operation: a.operation, lane: Option.none(), attempt: Option.some(a.attempt) }\n              : onLane(a.lane, a.attempt)),",
      },
    ],
  },
  {
    name: "void-value-read-null",
    tests: ["src/core/persist.test.ts"],
    says: "a void write's success saved with no value reads back null",
    rule: "WriteAhead R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "            value: a.value,",
        replace: "            value: a.value ?? null,",
      },
    ],
  },
  {
    name: "format-one-read-on-stack",
    tests: ["tests/session/values.test.ts"],
    says: "a format-1 last-seen form is read on the call stack, so a deep one fails the boot",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/actor-record.ts",
        find: "    const step = stepOfOne(task.form);",
        replace:
          '    const step = Result.map(stepOfOne(task.form), (s) => ({\n      ...s,\n      parts: s.parts.map((p) => ({ "~": "json", value: Result.getOrThrow(valueOfOne(p)) })),\n    }));',
      },
    ],
  },
  {
    name: "input-field-patched",
    tests: ["tests/actors/identity.test.ts"],
    says: "an update whose patch names an input field renames the actor's memory",
    rule: "Compile R7",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "  if (renames)\n",
        replace: "  if (renames && input.now < 0)\n",
      },
    ],
  },
  {
    name: "i17-other-identity-excuses",
    tests: ["tests/rules/rules.test.ts"],
    says: "an unheard Attempt is excused by any unread lane record its batch wrote, another identity's too",
    rule: "WriteAhead I17",
    edits: [
      {
        file: "tests/rules/commits.ts",
        find: '                key.startsWith(`lane/${laneOwner.get(attempt) ?? ""}|`) &&',
        replace: '                key.startsWith("lane/") &&',
      },
    ],
  },
];
