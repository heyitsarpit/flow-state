import type { Mutant } from "../dsl/oracle.ts";

const COMPILE = "../conformance/compile";

/**
 * Wrong compilers and Runtime creation checks the construction cases must catch, each by a
 * failed expectation citing the Invariant it breaks.
 *
 * **Details**
 *
 * The edits apply to the prototype tree: its compiler in `prototypes/conformance/compile/`,
 * Runtime creation's check in `round-14/gate.ts` and the data view in `round-14/codec/codec.ts`.
 * A `crashes` mutant throws a TypeError where a refusal belongs: the case fails on the crash,
 * never reading it as a refusal (Conformance R9).
 */
export const constructionMutants: ReadonlyArray<Mutant> = [
  {
    name: "cmp.callback-twice",
    says: "machine runs its callback once to look and once to build",
    expects: "Compile I1",
    runtime: "prototype",
    cases: ["CMP-01"],
    edits: [
      {
        file: `${COMPILE}/machine.ts`,
        find: "  const b = body({",
        replace:
          "  body({ S: statesOf<T>(tree), E: { ...tokens({ ...d.events, ...d.internalEvents }), ...placeToksOf(tree) } as never, O: handles<O, MemoryOf<M>>(d.ops) });\n  const b = body({",
      },
    ],
  },
  {
    name: "cmp.computed-initial-runs",
    says: "Flow.initial calls a computed initial at once to check its type",
    expects: "Compile I6",
    runtime: "prototype",
    cases: ["CMP-01"],
    edits: [
      {
        file: `${COMPILE}/memory.ts`,
        find: '    ? { schema, from: "initial", computed: value as',
        replace:
          '    ? { schema, from: "initial", _probe: (value as (s: object) => unknown)({}), computed: value as',
      },
    ],
  },
  {
    name: "cmp.uncertain-not-listed",
    says: "the events table leaves the Flow.uncertain events out of the internal events",
    expects: "Compile I4",
    runtime: "prototype",
    cases: ["CMP-02"],
    edits: [
      {
        file: `${COMPILE}/machine.ts`,
        find: "internal: Object.keys(d.internalEvents), payloads",
        replace:
          "internal: Object.keys(d.internalEvents).filter((e) => !uncertainOf(d.internalEvents).includes(e)), payloads",
      },
    ],
  },
  {
    name: "cmp.two-defaults-accepted",
    says: "a Flow.initial beside a Schema default is accepted, the Schema's default winning",
    expects: "Compile I5",
    runtime: "prototype",
    cases: ["CMP-03"],
    edits: [
      {
        file: `${COMPILE}/memory.ts`,
        find: '  if (f.from === "initial" && (c.has || d.has)) throw',
        replace: '  if (false && f.from === "initial" && (c.has || d.has)) throw',
      },
    ],
  },
  {
    name: "cmp.impure-default-accepted",
    says: "a Schema default that is an Effect to run is not refused as ImpureDefault",
    expects: "Compile I6",
    runtime: "prototype",
    cases: ["CMP-04"],
    edits: [
      {
        file: `${COMPILE}/memory.ts`,
        find: "  if (effectfulDefault(f.schema.ast)) throw",
        replace: "  if (false && effectfulDefault(f.schema.ast)) throw",
      },
    ],
  },
  {
    name: "cmp.unknown-onto-sure-event",
    says: "an unknown: mapped onto an event that is not Flow.uncertain is accepted",
    expects: "Compile I11",
    runtime: "prototype",
    cases: ["CMP-05"],
    edits: [
      {
        file: `${COMPILE}/operations.ts`,
        find: "    if (!isUncertain(events[t])) throw",
        replace: "    if (false && !isUncertain(events[t])) throw",
      },
    ],
  },
  {
    name: "cmp.bare-function-admitted",
    says: "creating a Runtime lets a function that is not a Slot through",
    expects: "Compile I15",
    runtime: "prototype",
    cases: ["CMP-06"],
    edits: [
      {
        file: "gate.ts",
        find: '    if (typeof v === "function") throw new Error(`SealUnknownClosure: ${c.id} ${p}`);',
        replace: '    if (typeof v === "function") return;',
      },
    ],
  },
  {
    name: "cmp.key-outside-input-admitted",
    says: "creating a Runtime lets a key field that is not an input field through",
    expects: "Compile I16",
    runtime: "prototype",
    cases: ["CMP-06"],
    edits: [
      {
        file: "gate.ts",
        find: "  if (bad.length) throw new Error(`SealKeyField:",
        replace: "  if (false && bad.length) throw new Error(`SealKeyField:",
      },
    ],
  },
  {
    name: "cmp.data-view-keeps-closures",
    says: "the data view keeps each Slot's closure beside its name",
    expects: "Compile I15",
    runtime: "prototype",
    cases: ["CMP-07"],
    edits: [
      {
        file: "codec/codec.ts",
        find: "      return { $slot: { definition: at.definition, path: at.path } };",
        replace:
          '      return { $slot: { definition: at.definition, path: at.path }, run: o["run"] };',
      },
    ],
  },
  {
    name: "cmp.commit-runs-at-construction",
    says: "construction calls each operation's commit once to check it gives an Effect",
    expects: "Compile I1",
    runtime: "prototype",
    cases: ["CMP-01"],
    edits: [
      {
        file: `${COMPILE}/operations.ts`,
        find: "    commit: slotOf(definition, `operations.${name}.commit`, c.commit),",
        replace:
          "    commit: slotOf(definition, `operations.${name}.commit`, ((c.commit as (i: unknown, x: unknown) => unknown)({}, {}), c.commit)),",
      },
    ],
  },
  {
    name: "cmp.state-dropped",
    says: "the compiled node table leaves out the state Busy",
    expects: "Compile I4",
    runtime: "prototype",
    cases: ["CMP-02"],
    edits: [
      {
        file: `${COMPILE}/machine.ts`,
        find: "  const nodes = compileNodes(d.id, tree, b as never, placed);",
        replace:
          '  const nodes = Object.fromEntries(Object.entries(compileNodes(d.id, tree, b as never, placed)).filter(([k]) => k !== "Busy"));',
      },
    ],
  },
  {
    name: "cmp.operation-dropped",
    says: "the compiled operations table leaves out the first operation",
    expects: "Compile I4",
    runtime: "prototype",
    cases: ["CMP-02"],
    edits: [
      {
        file: `${COMPILE}/machine.ts`,
        find: "    ops: { ...Object.fromEntries(Object.entries(d.ops).map(",
        replace: "    ops: { ...Object.fromEntries(Object.entries(d.ops).slice(1).map(",
      },
    ],
  },
  {
    name: "cmp.compiler-emits-bare-guard",
    says: "the compiler keeps a guard closure as a bare function, not a Slot",
    expects: "Compile I15",
    runtime: "prototype",
    cases: ["CMP-06"],
    edits: [
      {
        file: `${COMPILE}/body.ts`,
        find: "    else closures.push(slotOf(definition, `${path}.guard[${position}]`, g));",
        replace: "    else closures.push(g as never);",
      },
    ],
  },
  {
    name: "cmp.seal-crashes-on-bare",
    says: "Runtime creation crashes on a bare function instead of refusing it",
    expects: "Compile I15",
    runtime: "prototype",
    cases: ["CMP-06"],
    edits: [
      {
        file: "gate.ts",
        find: '    if (typeof v === "function") throw new Error(`SealUnknownClosure: ${c.id} ${p}`);',
        replace: '    if (typeof v === "function") (undefined as never as { x: () => void }).x();',
      },
    ],
  },
  {
    name: "cmp.seal-crashes-on-key",
    says: "Runtime creation crashes on a key field outside the input instead of refusing it",
    expects: "Compile I16",
    runtime: "prototype",
    cases: ["CMP-06"],
    edits: [
      {
        file: "gate.ts",
        find: "  if (bad.length) throw new Error(`SealKeyField:",
        replace:
          "  if (bad.length) (undefined as never as { x: () => void }).x();\n  if (false) throw new Error(`SealKeyField:",
      },
    ],
  },
  {
    name: "r15.creation-decodes-input",
    says: "creation decodes a present input with its Schema's transformation (the old suite's mutant)",
    expects: "Compile I7",
    runtime: "prototype",
    cases: ["CMP-08"],
    edits: [
      {
        file: `${COMPILE}/memory.ts`,
        find: "Schema.decodeUnknownSync(Schema.toType(Schema.Struct({ [k]: s.schema }) as unknown as Schema.Top)",
        replace:
          "Schema.decodeUnknownSync((Schema.Struct({ [k]: s.schema }) as unknown as Schema.Top)",
      },
    ],
  },
  {
    name: "cmp.restore-runs-creation",
    says: "restore runs creation over the stored record",
    expects: "Compile I8",
    runtime: "prototype",
    cases: ["CMP-09"],
    edits: [
      {
        file: `${COMPILE}/memory.ts`,
        find: 'return slotOf<(stored: unknown) => object>(definition, "memory.restore", (stored: unknown) => {',
        replace:
          'return slotOf<(stored: unknown) => object>(definition, "memory.restore", (stored: unknown) => {\n    if (stored !== null) return initialOf(definition, m).run(stored);',
      },
    ],
  },
  {
    name: "d138.self-allowed",
    says: "a state named self is not reserved (the old suite's mutant)",
    expects: "Compile I13",
    runtime: "prototype",
    cases: ["CMP-10"],
    edits: [
      {
        file: "gate.ts",
        find: 'new Set(["self", "__proto__"])',
        replace: 'new Set(["__proto__"])',
      },
    ],
  },
  {
    name: "r15c.duplicate-machine-allowed",
    says: "an app may list two machines under one id (the old suite's mutant)",
    expects: "Compile I14",
    runtime: "prototype",
    cases: ["CMP-11"],
    edits: [
      {
        file: "gate.ts",
        find: "  if (dup !== undefined) throw new Error(`DuplicateMachine: ${dup}`);",
        replace: "",
      },
    ],
  },
];
