import { Effect, Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { dataView } from "../../src/host/inspect.ts";
import {
  app,
  definition,
  Diagnostic,
  Flow,
  FlowError,
  machine,
  runtimeSetup,
  transaction,
} from "../../src/index.ts";
import { compiledOf } from "../../src/host/inspect.ts";
import { loose } from "../../src/test/loose.ts";

const save = transaction({
  id: "Compiled/save",
  input: { id: Schema.String, note: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.void,
});

const Lamp = definition({
  id: "Compiled/Lamp",
  states: ["OFF", { ON: ["DIM", "BRIGHT"] }],
  events: { Flip: {}, Dim: { level: Schema.Number } },
  internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
  memory: { level: Flow.initial(Schema.Number, 0) },
  operations: ({ E }) => ({
    save: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
  }),
});

const build = () =>
  machine(Lamp, ({ S, O }) => ({
    default: S.OFF,
    on: {
      Dim: {
        guard: ({ event }) => event.level >= 0 || true,
        updateMemory: ({ event }) => ({ level: event.level }),
      },
      Flip: { target: S.ON, actions: [O.save.commit(() => ({ id: "a", note: "" }))] },
    },
    states: { ON: { default: S.ON.DIM, on: { Flip: S.OFF } } },
  }));

// FLOW_STATE_ALLOW_UNKNOWN: a data view is plain data of any shape.
type View = unknown;

// RETURN_TYPE: recursive: the leaves of a data view.
const partsOf = (view: View): ReadonlyArray<View> => {
  if (Array.isArray(view)) return view.flatMap(partsOf);

  return Predicate.isObject(view) ? Object.values(view).flatMap(partsOf) : [view];
};

// FLOW_STATE_ALLOW_UNKNOWN: a data view is plain data of any shape.
const functionsIn = (view: unknown) => partsOf(view).filter(Predicate.isFunction).length;

// FLOW_STATE_ALLOW_UNKNOWN: a data view is plain data of any shape.
const stringsIn = (view: unknown) => partsOf(view).filter(Predicate.isString);

// The refusal a construction meets, as [code, reason].
const refusalOfConstruct = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return [error.code, error.diagnostics[0].details["reason"] ?? null] as const;
  }

  return [] as const;
};

// The refusal a hand-made Compiled meets on its way to a Runtime, as [code, reason].
const refusalOf = (compiled: unknown) =>
  refusalOfConstruct(() =>
    runtimeSetup({
      app: app({ id: "lamps", machines: { lamp: loose({ ...build(), compiled }) } }),
    }).construct(),
  );

describe("Compiled and its data view (Compile R16, R17, T8, T9)", () => {
  it("two compiles of one source give equal data views, with Slots as names and Schemas as JSON Schema documents", () => {
    const first = dataView(compiledOf(build()));

    expect(dataView(compiledOf(build()))).toEqual(first);
    expect(functionsIn(first)).toBe(0);
    expect(stringsIn(first)).toContain("on.Dim[0].guard[0]");
  });

  it("Operations R10: a machine carrying a hand-made Compiled (a bare function, a key field outside the input, no events table) is a copy, refused WrongKind before any Runtime", () => {
    const compiled = compiledOf(build());
    const [first] = [...(compiled.root.get("Dim") ?? [])];

    expect(
      refusalOf({
        ...compiled,
        root: new Map([["Dim", [{ ...first, update: Option.some(() => ({})) }]]]),
      }),
    ).toEqual(["InvalidConfiguration", "WrongKind"]);
    expect(
      refusalOf({
        ...compiled,
        operations: new Map(
          [...compiled.operations].map(([k, op]) => [k, { ...op, keyFields: ["missing"] }]),
        ),
      }),
    ).toEqual(["InvalidConfiguration", "WrongKind"]);
    expect(refusalOf({ ...compiled, events: undefined })).toEqual([
      "InvalidConfiguration",
      "WrongKind",
    ]);
  });

  it("Compile R17: untyped code that puts a function that is not a Slot into a machine's own Compiled is refused BareFunction at construct", () => {
    const lamp = build();
    const compiled = compiledOf(lamp);
    const [first] = [...(compiled.root.get("Dim") ?? [])];

    const construct = () =>
      runtimeSetup({ app: app({ id: "lamps", machines: { lamp } }) }).construct();

    // Untyped code holds the Compiled's tables as plain Maps.
    const root: Map<string, unknown> = loose(compiled.root);

    root.set("Dim", [{ ...first, update: Option.some(() => ({})) }]);

    expect(refusalOfConstruct(construct)).toEqual(["InvalidConfiguration", "BareFunction"]);
  });

  it("a machine's own Compiled, carrying its memory's derived equality and codecs, is accepted", () => {
    expect(() =>
      runtimeSetup({ app: app({ id: "lamps", machines: { lamp: build() } }) }).construct(),
    ).not.toThrow();
  });
});

describe("Diagnostic (Diagnostics R2, I2, T1)", () => {
  const valid = {
    _tag: "Diagnostic",
    classification: "Failure",
    code: "InvalidConfiguration",
    path: ["states", 0],
    details: { reason: "WrongKind", refused: "InvalidTurn", slot: null },
    summary: "a state is not a name",
    help: "Write a name.",
  };

  const decode = Schema.decodeUnknownOption(Diagnostic);

  it("round-trips through its Schema", () => {
    const decoded = decode(valid);

    expect(Option.map(decoded, (d) => Schema.encodeSync(Diagnostic)(d))).toEqual(
      Option.some(valid),
    );
  });

  it("refuses an unknown code, a non-finite number, a detail of the wrong type or value, a wrong tag and a missing field", () => {
    expect(Option.isNone(decode({ ...valid, code: "Nope" }))).toBe(true);
    expect(Option.isNone(decode({ ...valid, path: [Number.POSITIVE_INFINITY] }))).toBe(true);
    expect(Option.isNone(decode({ ...valid, details: { reason: Number.NaN } }))).toBe(true);
    expect(Option.isNone(decode({ ...valid, details: { refused: "Nope" } }))).toBe(true);
    expect(Option.isNone(decode({ ...valid, _tag: "Other" }))).toBe(true);
    expect(Option.isNone(decode({ ...valid, help: undefined }))).toBe(true);
  });
});
