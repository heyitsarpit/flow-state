import assert from "node:assert/strict";
import { Effect, Option, Result, Schema, SchemaGetter } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  runtimeSetup,
  transaction,
} from "../../src/index.ts";

// Each diagnostic of a refused construction as [code, reason, path].
const refusal = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return error.diagnostics.map(
        (d) => [d.code, d.details["reason"] ?? null, d.path.join(".")] as const,
      );

    throw error;
  }

  return [] as const;
};

const save = transaction({
  id: "Compile/save",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.void,
});

// Untyped configuration, as a JavaScript caller would pass it.
// FLOW_STATE_ALLOW_UNKNOWN: the test hands construction values its types forbid.
const loose = (value: unknown) =>
  // SAFETY: each refused form is one the types reject; construction must refuse it at run time too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the untyped caller construction guards against
  value as never;

// Names well past any a real machine uses, and a state path well past any real tree's depth.
const LONG_NAME = 4096;
const DEPTH = 100;

const nameAt = (level: number) => `${"n".repeat(LONG_NAME - String(level).length)}${level}`;

const LEVELS = Array.from({ length: DEPTH }, (_, level) => nameAt(level));

const LONG_EVENT = "e".repeat(LONG_NAME);

// DEPTH nested compounds down to two leaves, A and B.
const deepTree = LEVELS.reduceRight<ReadonlyArray<unknown>>(
  (kids, name) => [{ [name]: kids }],
  ["A", "B"],
);

// FLOW_STATE_ALLOW_UNKNOWN: a state reference reached by name, which the deep tree's types cannot spell.
type Ref = Record<string, unknown>;

// The body of the compound `ref` at `level`: its one child the default, down to A, which moves to
// B on the long event.
// FLOW_STATE_ALLOW_UNKNOWN: a body built by name, which the deep tree's types cannot spell.
// RETURN_TYPE: recursive: a body holds the body of its one child.
const bodyAt = (ref: Ref, level: number): unknown => {
  const name = LEVELS[level];

  if (name === undefined)
    return { default: ref["A"], states: { A: { on: { [LONG_EVENT]: ref["B"] } }, B: {} } };

  const child = loose(ref[name]);

  return { default: child, states: { [name]: bodyAt(child, level + 1) } };
};

// Built on call, so a refusal fails only the test that builds it.
const deepMachine = () =>
  machine(
    definition(
      loose({ id: "i".repeat(LONG_NAME), states: deepTree, events: { [LONG_EVENT]: {} } }),
    ),
    ({ S }) => loose(bodyAt(loose(S), 0)),
  );

describe("one construction failure (Compile R2, I3, T2)", () => {
  it("a definition with three violations in different fields throws one FlowError listing all three, in declaration then rule order, with paths", () => {
    expect(
      refusal(() =>
        definition(
          loose({
            id: "Compile/Three",
            states: ["A", "is"],
            events: { Go: { _tag: Schema.String } },
            memory: { count: Schema.Number },
          }),
        ),
      ),
    ).toEqual([
      ["ReservedStateName", null, "states.is"],
      ["InvalidConfiguration", "ReservedField", "events.Go._tag"],
      ["InvalidConfiguration", "NoSource", "memory.count"],
    ]);
  });

  it("the error's code is its first diagnostic's, every diagnostic is a Failure with help, and nothing is returned", () => {
    const caught = Result.try({
      try: () => definition(loose({ id: "", states: [], events: {} })),
      catch: (error) => error,
    });

    expect(Result.isFailure(caught)).toBe(true);
    expect(Result.isFailure(caught) && caught.failure instanceof FlowError).toBe(true);

    if (Result.isFailure(caught) && caught.failure instanceof FlowError) {
      const flow = caught.failure;

      expect(flow.code).toBe(flow.diagnostics[0].code);
      expect(flow.diagnostics.every((d) => d.classification === "Failure")).toBe(true);
      expect(flow.diagnostics.every((d) => d.help.length > 0)).toBe(true);
    }
  });
});

describe("the declared shape (Compile R4, R12)", () => {
  it("refuses unknown fields and wrong kinds, each at its path", () => {
    expect(
      refusal(() =>
        definition(
          loose({
            id: "Compile/Kinds",
            states: ["A", 7, {}],
            events: { Go: {} },
            placement: {},
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "WrongKind", "states.1"],
      ["InvalidConfiguration", "WrongKind", "states.2"],
      ["InvalidConfiguration", "UnknownField", "placement"],
    ]);
  });

  it("refuses an empty compound, duplicate siblings, overlapping public and internal names, and _tag fields", () => {
    expect(
      refusal(() =>
        definition(
          loose({
            id: "Compile/Rules",
            states: ["A", "A", { B: [] }],
            events: { Go: {} },
            internalEvents: { Go: {} },
            memory: { _tag: Flow.initial(Schema.String, "") },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "DuplicateName", "states.A"],
      ["InvalidConfiguration", "EmptyCompound", "states.B"],
      ["InvalidConfiguration", "DuplicateName", "internalEvents.Go"],
      ["InvalidConfiguration", "ReservedField", "memory._tag"],
    ]);
  });

  it("reserves is, child, history, self and __proto__ anywhere, root at the top level, and dots", () => {
    expect(
      refusal(() =>
        definition(
          loose({
            id: "Compile/Names",
            states: ["root", "self", { OK: ["root", "child", "history", "__proto__", "a.b"] }],
            events: {},
          }),
        ),
      ).map(([code, reason, path]) => `${code} ${reason} ${path}`),
    ).toEqual([
      "ReservedStateName null states.root",
      "ReservedStateName null states.self",
      "ReservedStateName null states.OK.child",
      "ReservedStateName null states.OK.history",
      "ReservedStateName null states.OK.__proto__",
      "InvalidConfiguration InvalidName states.OK.a.b",
    ]);
  });

  it("refuses an authored name that is empty or holds a control character or a lone surrogate, at any length or depth", () => {
    expect(
      refusal(() =>
        definition(
          loose({
            id: "x".repeat(LONG_NAME),
            states: ["", "a\u0007", "b\uD800", "c\u007F", ...deepTree],
            events: { ["é".repeat(LONG_NAME)]: {} },
          }),
        ),
      ).map(([, reason, path]) => `${reason} ${path}`),
    ).toEqual([
      "InvalidName states.",
      "InvalidName states.a\u0007",
      "InvalidName states.b\uD800",
      "InvalidName states.c\u007F",
    ]);
  });

  it("Compile R4: names of 4,096 bytes and a state path 100 levels deep compile, and a Runtime enters the deepest leaf and moves within it", () => {
    const deep = deepMachine();
    const runtime = runtimeSetup({ app: app({ id: "deep", machines: { deep } }) }).construct();
    Effect.runSync(runtime.ready());
    const handle = runtime.ensureActor(actorRef(deep, "deep"));
    const leafOf = () => Option.map(handle.getSnapshot(), (s) => s.state.split("."));

    expect(leafOf()).toEqual(Option.some([...LEVELS, "A"]));
    handle.send(loose({ _tag: LONG_EVENT }));
    expect(leafOf()).toEqual(Option.some([...LEVELS, "B"]));
  });

  it("a name compares by exact spelling: two spellings of é are two siblings", () => {
    expect(
      refusal(() => definition({ id: "Compile/Spelling", states: ["é", "é"], events: {} })),
    ).toEqual([]);
  });
});

describe("one source per memory field (Compile R5, I5, I6, T3)", () => {
  const counted = { runs: 0 };

  const Ticking = Schema.optionalKey(Schema.Number).pipe(
    Schema.withConstructorDefault(Effect.sync(() => (counted.runs += 1))),
  );

  it("refuses a Schema default beside Flow.initial as TwoDefaults, and a default that is not a succeeded value as ImpureDefault, without running it", () => {
    const Defaulted = Schema.Number.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1)));

    expect(
      refusal(() =>
        definition(
          loose({
            id: "Compile/Defaults",
            states: ["A"],
            events: {},
            memory: {
              a: Flow.initial(Defaulted, 2),
              b: Ticking,
              c: Schema.optionalKey(Schema.Number).pipe(
                Schema.withConstructorDefault(Effect.succeed(3)),
              ),
            },
          }),
        ),
      ),
    ).toEqual([
      ["TwoDefaults", null, "memory.a"],
      ["ImpureDefault", null, "memory.b"],
    ]);
    expect(counted.runs).toBe(0);
  });
});

describe("identity fields (Compile R7, I9, T12)", () => {
  it("a machine's input fields are required, default-free and string-encoded, else IdentityFieldOptional", () => {
    expect(
      refusal(() =>
        definition({
          id: "Compile/Identity",
          states: ["A"],
          events: {},
          memory: {
            ok: Flow.input(Schema.String),
            number: Flow.input(Schema.Number),
            optional: Flow.input(Schema.optionalKey(Schema.String)),
            defaulted: Flow.input(
              Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed("x"))),
            ),
          },
        }),
      ),
    ).toEqual([
      ["IdentityFieldOptional", null, "memory.number"],
      ["IdentityFieldOptional", null, "memory.optional"],
      ["IdentityFieldOptional", null, "memory.defaulted"],
    ]);
  });

  it("a string-encoded input field that decodes to another type is an identity field", () => {
    const Count = Schema.String.pipe(
      Schema.decodeTo(Schema.Number, {
        decode: SchemaGetter.transform((s: string) => Number(s)),
        encode: SchemaGetter.transform((n: number) => String(n)),
      }),
    );

    expect(
      refusal(() =>
        definition({
          id: "Compile/Count",
          states: ["A"],
          events: {},
          memory: { n: Flow.input(Count) },
        }),
      ),
    ).toEqual([]);
  });
});

describe("operations declared once (Compile R9, I10, I11, T3)", () => {
  it("an unknown: target that is not Flow.uncertain is UnknownNotUncertain; two writes of one contract are SharedContract", () => {
    expect(
      refusal(() =>
        definition({
          id: "Compile/Ops",
          states: ["A"],
          events: {},
          internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
          operations: ({ E }) => ({
            first: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Saved }),
            second: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
          }),
        }),
      ),
    ).toEqual([
      ["UnknownNotUncertain", null, "operations.first.unknown"],
      ["SharedContract", null, "operations.second"],
    ]);
  });
});

const Lamp = definition({
  id: "Compile/Lamp",
  states: ["OFF", { ON: ["DIM", "BRIGHT"] }],
  events: { Flip: {}, Dim: { level: Schema.Number } },
  internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
  operations: ({ E }) => ({
    save: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
  }),
});

const Other = definition({
  id: "Compile/Other",
  states: ["OFF", { ON: ["DIM", "BRIGHT"] }],
  events: { Flip: {} },
});

describe("the machine adds nothing (Compile R1, R3, R4, T1, T11)", () => {
  it("runs its callback exactly once", () => {
    let calls = 0;

    machine(Lamp, ({ S }) => {
      calls += 1;

      return { default: S.OFF, states: { ON: { default: S.ON.DIM } } };
    });

    expect(calls).toBe(1);
  });

  it("refuses a body that adds a state, handles an undeclared event, targets or defaults to another definition's state, or lacks a compound's default", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S }) =>
          loose({
            default: Other.S.OFF,
            on: { Blink: S.OFF, Flip: { target: Other.S.ON } },
            states: { DARK: {}, ON: { states: { DIM: { default: S.OFF } } } },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "ForeignToken", "default"],
      ["InvalidConfiguration", "UnknownEvent", "on.Blink"],
      ["InvalidConfiguration", "ForeignToken", "on.Flip.0.target"],
      ["InvalidConfiguration", "UnknownState", "states.DARK"],
      ["InvalidConfiguration", "MissingDefault", "states.ON.default"],
      ["InvalidConfiguration", "LeafHasChildren", "states.ON.states.DIM.default"],
    ]);
  });

  it("refuses a default that is not a direct child, two schedules of one name, an undeclared armOn event, and a fixed delay past 2^31 - 1 ms", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S, E }) =>
          loose({
            default: S.ON.DIM,
            states: {
              OFF: { schedules: { off: { schedule: "1 second", send: E.Flip } } },
              ON: {
                default: S.OFF,
                schedules: {
                  off: { schedule: 2_147_483_648, send: E.Flip, armOn: ["Blink"] },
                },
              },
            },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "DefaultNotChild", "default"],
      ["InvalidConfiguration", "DefaultNotChild", "states.ON.default"],
      ["InvalidConfiguration", "DuplicateName", "states.ON.schedules.off"],
      ["InvalidConfiguration", "UnknownEvent", "states.ON.schedules.off.armOn"],
      ["InvalidConfiguration", "DelayOutOfRange", "states.ON.schedules.off.schedule"],
    ]);
  });

  it("a schedule of exactly 2^31 - 1 ms compiles", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S, E }) => ({
          default: S.OFF,
          states: {
            OFF: { schedules: { off: { schedule: 2_147_483_647, send: E.Flip } } },
            ON: { default: S.ON.DIM },
          },
        })),
      ),
    ).toEqual([]);
  });
});

describe("Schemas and event constructors (Compile R14)", () => {
  it("E.X checks its payload on every call and throws InvalidEvent; a payload-free constructor takes no argument", () => {
    expect(Lamp.E.Flip()).toEqual({ _tag: "Flip" });
    expect(Lamp.E.Dim({ level: 2 })).toEqual({ _tag: "Dim", level: 2 });
    expect(refusal(() => Lamp.E.Dim(loose({ level: "high" })))).toEqual([
      ["InvalidEvent", null, "E.Dim.level"],
    ]);
  });

  it("Event decodes public envelopes only, and State complete leaf paths only", () => {
    const event = Schema.decodeUnknownOption(Lamp.Event);
    const state = Schema.decodeUnknownOption(Lamp.State);

    expect(event({ _tag: "Dim", level: 1 })._tag).toBe("Some");
    expect(event({ _tag: "Saved" })._tag).toBe("None");
    expect(state("ON.DIM")._tag).toBe("Some");
    expect(state("ON")._tag).toBe("None");
  });
});

describe("a closed app (Compile R15, I14, T7)", () => {
  const one = machine(Lamp, ({ S }) => ({ default: S.OFF, states: { ON: { default: S.ON.DIM } } }));

  const twin = machine(
    definition({
      id: "Compile/Lamp",
      states: ["A"],
      events: {},
      internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
      operations: ({ E }) => ({
        save: transaction({
          id: "Compile/save",
          input: { id: Schema.String },
          key: ["id"],
          concurrency: "reject",
          services: [],
          commit: () => Effect.void,
        }).outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
      }),
    }),
    ({ S }) => ({ default: S.A }),
  );

  it("refuses unknown fields, one machine under two keys, two machines with one id, and two contracts with one id, naming each entry", () => {
    expect(
      refusal(() => app(loose({ id: "lamps", machines: { a: one, b: one, c: twin }, extra: 1 }))),
    ).toEqual([
      ["InvalidConfiguration", "UnknownField", "extra"],
      ["InvalidConfiguration", "MachineTwice", "machines.b"],
      ["InvalidConfiguration", "DuplicateMachineId", "machines.c"],
      ["InvalidConfiguration", "DuplicateContractId", "machines.c.operations.save"],
    ]);
  });
});

describe("required fields and key fields (Compile R4, T3)", () => {
  it("a definition without id, states or events is refused MissingField for each", () => {
    expect(refusal(() => definition(loose({})))).toEqual([
      ["InvalidConfiguration", "MissingField", "id"],
      ["InvalidConfiguration", "MissingField", "states"],
      ["InvalidConfiguration", "MissingField", "events"],
    ]);
  });

  it("an operation keyed by an optional input field is refused KeyFieldOptional", () => {
    const loose_ = transaction({
      id: "Compile/loose",
      input: { id: Schema.optionalKey(Schema.String) },
      key: ["id"],
      concurrency: "reject",
      services: [],
      commit: () => Effect.void,
    });

    expect(
      refusal(() =>
        definition({
          id: "Compile/Keys",
          states: ["A"],
          events: {},
          internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
          operations: ({ E }) => ({
            save: loose_.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
          }),
        }),
      ),
    ).toEqual([["KeyFieldOptional", null, "operations.save.key.id"]]);
  });
});

describe("fixed delays (Turn R14, T6)", () => {
  it("a negative or non-finite fixed delay is refused DelayOutOfRange", () => {
    for (const delay of [-1, Number.POSITIVE_INFINITY, Number.NaN])
      expect(
        refusal(() =>
          machine(Lamp, ({ S, E }) => ({
            default: S.OFF,
            states: {
              OFF: { schedules: { off: { schedule: delay, send: E.Flip } } },
              ON: { default: S.ON.DIM },
            },
          })),
        ),
      ).toEqual([["InvalidConfiguration", "DelayOutOfRange", "states.OFF.schedules.off.schedule"]]);
  });
});

describe("the snapshot (Turn R23, Compile R14)", () => {
  const Doc = definition({
    id: "Compile/Doc",
    states: ["CLEAN"],
    events: {},
    memory: {
      body: Flow.initial(Schema.String, ""),
      draftKey: Flow.private(Flow.initial(Schema.String, "k")),
    },
  });

  it("the Snapshot Schema decodes a leaf state and the memory without its private fields", () => {
    const decode = Schema.decodeUnknownOption(Doc.Snapshot);

    expect(decode({ state: "CLEAN", memory: { body: "hi", draftKey: "k" } })).toEqual(
      Option.some({ state: "CLEAN", memory: { body: "hi" } }),
    );
    expect(decode({ state: "DIRTY", memory: { body: "" } })._tag).toBe("None");
  });
});

describe("operations map onto this definition's events (Compile R3, R17, I16)", () => {
  it("an ending mapped to an event the definition does not declare is refused UnknownEvent", () => {
    const Other = definition({
      id: "Compile/Elsewhere",
      states: ["A"],
      events: {},
      internalEvents: { Gone: {} },
    });

    expect(
      refusal(() =>
        definition({
          id: "Compile/Endings",
          states: ["A"],
          events: {},
          internalEvents: { Unsure: Flow.uncertain({}) },
          operations: ({ E }) => ({
            save: save.outcomes({ success: Other.E.Gone, failure: {}, unknown: E.Unsure }),
          }),
        }),
      ),
    ).toEqual([["InvalidConfiguration", "UnknownEvent", "operations.save.success"]]);
  });

  it("an operation keyed by a field outside its input is refused at construction, before any Runtime", () => {
    const bound = save.outcomes(
      loose({
        success: { ending: { event: "Saved", from: Option.none() } },
        failure: {},
        unknown: { ending: { event: "Unsure", from: Option.none() } },
      }),
    );

    expect(
      refusal(() =>
        definition({
          id: "Compile/KeyOutside",
          states: ["A"],
          events: {},
          internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
          operations: () => ({ save: { ...bound, key: ["missing"] } }),
        }),
      ),
    ).toEqual([["InvalidConfiguration", "KeyOutsideInput", "operations.save.key.missing"]]);
  });

  it("Compile R2, R4: a Flow.uncertain-shaped event with no fields is refused WrongKind, never a raw TypeError", () => {
    expect(
      refusal(() =>
        definition(
          loose({ id: "Compile/NoFields", states: ["A"], events: { X: { "~flow": "uncertain" } } }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "WrongKind", "events.X"]]);
  });

  it("Compile R4: a context slot that is not Provider.select's is refused WrongKind", () => {
    expect(
      refusal(() =>
        definition(loose({ id: "Compile/Context", states: ["A"], events: {}, context: { c: 5 } })),
      ),
    ).toEqual([["InvalidConfiguration", "WrongKind", "context.c"]]);
  });

  it("Compile R2, R4: a handler that is null or a bare string, and an armOn element that is neither an event name nor Flow.entry, are refused WrongKind", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S, E }) =>
          loose({
            default: S.OFF,
            on: { Flip: null, Dim: "ON" },
            states: {
              OFF: { schedules: { off: { schedule: "1 second", send: E.Flip, armOn: [5] } } },
              ON: { default: S.ON.DIM },
            },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "WrongKind", "on.Flip"],
      ["InvalidConfiguration", "WrongKind", "on.Dim"],
      ["InvalidConfiguration", "WrongKind", "states.OFF.schedules.off.armOn.0"],
    ]);
  });

  it("Compile R4: an alternative or a schedule with a field it does not have is refused UnknownField", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S, E }) =>
          loose({
            default: S.OFF,
            on: { Flip: { target: S.OFF, gaurd: [] } },
            states: {
              OFF: { schedules: { off: { schedule: "1 second", send: E.Flip, every: true } } },
              ON: { default: S.ON.DIM },
            },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "UnknownField", "on.Flip.gaurd"],
      ["InvalidConfiguration", "UnknownField", "states.OFF.schedules.off.every"],
    ]);
  });

  it("an id or persist of the wrong kind is refused WrongKind", () => {
    expect(
      refusal(() => definition(loose({ id: 7, persist: "yes", states: ["A"], events: {} }))),
    ).toEqual([
      ["InvalidConfiguration", "WrongKind", "id"],
      ["InvalidConfiguration", "WrongKind", "persist"],
    ]);
  });
});

// Lamp's twin: another definition whose operation has Lamp's operation's name.
const Twin = definition({
  id: "Compile/Twin",
  states: ["OFF"],
  events: { Flip: {} },
  internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
  operations: ({ E }) => ({
    save: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
  }),
});

// Each diagnostic of a refused construction as [code, reason, path], its path kept as segments.
const segments = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return error.diagnostics.map((d) => [d.code, d.details["reason"] ?? null, d.path] as const);

    throw error;
  }

  return [] as const;
};

describe("construction refuses every malformed form with one FlowError (Compile R2, R3, R4)", () => {
  it("Compile R2, R4: definition(null) and definition(undefined) are refused WrongKind at the configuration, never a raw TypeError", () => {
    for (const config of [null, undefined])
      expect(refusal(() => definition(loose(config)))).toEqual([
        ["InvalidConfiguration", "WrongKind", ""],
      ]);
  });

  it("Compile R2, R4: an operations callback that returns no record is refused WrongKind at operations", () => {
    expect(
      refusal(() =>
        definition(
          loose({ id: "Compile/NoOps", states: ["A"], events: {}, operations: () => undefined }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "WrongKind", "operations"]]);
  });

  it("Compile R2, R4: an operations record whose value is not an operation is refused WrongKind at it, never a raw TypeError", () => {
    expect(
      refusal(() =>
        definition(
          loose({
            id: "Compile/BadOp",
            states: ["A"],
            events: {},
            operations: () => ({ save: 5 }),
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "WrongKind", "operations.save"]]);
  });

  it("Compile R4: a fixed delay written { sec: 5 } is not a Duration input: its unknown field is refused UnknownField", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S, E }) =>
          loose({
            default: S.OFF,
            states: {
              OFF: { schedules: { off: { schedule: { sec: 5 }, send: E.Flip } } },
              ON: { default: S.ON.DIM },
            },
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "UnknownField", "states.OFF.schedules.off.schedule.sec"]]);
  });

  it("Compile R4, R5: a constant start its field's Schema refuses is refused WrongKind at its memory field", () => {
    expect(
      refusal(() =>
        definition(
          loose({
            id: "Compile/Constant",
            states: ["A"],
            events: {},
            memory: { count: Flow.initial(Schema.Number, loose("0")) },
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "WrongKind", "memory.count"]]);
  });

  it("Compile R3: a guard and an action of another definition's operation of the same name are refused ForeignToken", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S }) =>
          loose({
            default: S.OFF,
            on: {
              Flip: {
                guard: Twin.O.save.idle(() => ({ id: "a" })),
                actions: [Twin.O.save.commit(() => ({ id: "a" }))],
              },
            },
            states: { ON: { default: S.ON.DIM } },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "ForeignToken", "on.Flip.0.guard.0"],
      ["InvalidConfiguration", "ForeignToken", "on.Flip.0.actions.0"],
    ]);
  });

  it("Compile R3: an onContext event of another definition, as E.X or E.X.from(f), is refused ForeignToken", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S }) =>
          loose({
            default: S.OFF,
            onContext: [
              { select: () => 1, event: Twin.E.Flip },
              { select: () => 1, event: Twin.E.Flip.from(() => ({})) },
            ],
            states: { ON: { default: S.ON.DIM } },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "ForeignToken", "onContext.0.event"],
      ["InvalidConfiguration", "ForeignToken", "onContext.1.event"],
    ]);
  });

  it("Compile R2, R9; Diagnostics R2: a failure tag that holds a dot is one segment of its finding's path", () => {
    expect(
      segments(() =>
        definition(
          loose({
            id: "Compile/DottedTag",
            states: ["A"],
            events: {},
            internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
            operations: ({ E }: { readonly E: typeof Twin.E }) => ({
              save: save.outcomes(
                loose({
                  success: E.Saved,
                  failure: {
                    "Card.Declined": { ending: { event: "Declined", from: Option.none() } },
                  },
                  unknown: E.Unsure,
                }),
              ),
            }),
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "UnknownEvent", ["operations", "save", "failure", "Card.Declined"]],
    ]);
  });
});

describe("a construction callback that throws, or no definition (Compile R2; Diagnostics R1, R6)", () => {
  it("Diagnostics R1, R6: an operations callback that throws is one FlowError Defect at operations, carrying what it threw", () => {
    const thrown = new Error("boom");

    const construct = () =>
      definition(
        loose({
          id: "Compile/Throws",
          states: ["A"],
          events: {},
          operations: () => {
            throw thrown;
          },
        }),
      );

    expect(refusal(construct)).toEqual([["Defect", null, "operations"]]);
    assert.throws(construct, (error) => error instanceof FlowError && error.cause === thrown);
  });

  it("Diagnostics R1, R6: a machine body that throws is one FlowError Defect, carrying what it threw", () => {
    expect(
      refusal(() =>
        machine(Lamp, () => {
          throw new Error("boom");
        }),
      ),
    ).toEqual([["Defect", null, "body"]]);
  });

  it("Compile R2, R4: machine(null) is refused WrongKind at its definition, never a raw TypeError", () => {
    expect(refusal(() => machine(loose(null), () => loose({})))).toEqual([
      ["InvalidConfiguration", "WrongKind", "definition"],
    ]);
  });
});
