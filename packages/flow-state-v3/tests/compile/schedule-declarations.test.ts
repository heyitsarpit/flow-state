import { Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Room } from "../../fixtures/home/machines/room.ts";
import { definition, Flow, type Machine, machine } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { refusal } from "../refusals.ts";
import { compiledOf } from "../../src/host/inspect.ts";

// Declared schedules, the runtime half: the declaration on the definition, the body's placement
// checked against it at construction (the twin rule), and each schedule's key and selection codec
// in `Compiled.schedules`. These call `definition` and `machine` as plain JavaScript does.

type Tokens = {
  readonly S: Readonly<Record<string, unknown>>;
  readonly E: Readonly<Record<string, unknown>>;
};

const untyped: {
  readonly definition: (config: unknown) => Tokens;
  readonly machine: (definition: unknown, body: (tokens: Tokens) => unknown) => Machine;
} = loose({ definition, machine });

// A lamp whose definition declares `schedules`, as an app author writes it.
const Lamp = (schedules: unknown) =>
  untyped.definition({
    id: "Declared/Lamp",
    states: ["OFF", "ON"],
    events: { Flip: {}, Away: {} },
    internalEvents: { Tick: {} },
    memory: {
      ids: Flow.initial(Schema.Array(Schema.String), []),
      level: Flow.initial(Schema.Number, 0),
    },
    schedules,
  });

// The lamp's machine with `placed(tokens)` as the OFF state's schedules, and ON's when given.
const lampMachine = (
  schedules: unknown,
  placed: (tokens: Tokens) => unknown,
  onPlaced: Option.Option<(tokens: Tokens) => unknown> = Option.none(),
) =>
  untyped.machine(Lamp(schedules), (tokens) => ({
    default: tokens.S["OFF"],
    states: {
      OFF: { on: { Flip: tokens.S["ON"] }, schedules: placed(tokens) },
      ON: Option.match(onPlaced, {
        onNone: () => ({ on: { Flip: tokens.S["OFF"] } }),
        onSome: (place) => ({ on: { Flip: tokens.S["OFF"] }, schedules: place(tokens) }),
      }),
    },
  }));

// A refusal as `[reason, whether its path is inside `at`]`; none when it constructs.
const refusedAt = (at: string, construct: () => unknown) =>
  refusal(construct, (d) => [
    String(d.details.reason ?? d.code),
    String(d.path.join(".").startsWith(at)),
  ]);

const TICK = "states.OFF.schedules.tick";

describe("the declaration (Types R8; Schedules R16)", () => {
  it("Types R8: a definition declares its schedules by name, each with key, pausedBy and restartOn, and its body places them (holds today: the declaration is accepted and not read)", () => {
    expect(
      refusal(() =>
        lampMachine(
          {
            tick: {},
            poll: {
              key: { id: Schema.String },
              pausedBy: ["Away"],
              restartOn: Schema.Number,
            },
          },
          ({ E }) => ({
            tick: { schedule: 1000, send: E["Tick"] },
            poll: {
              schedule: 1000,
              send: E["Tick"],
              keys: () => [{ id: "a" }],
              paused: { Away: () => false },
              restartOn: () => 1,
            },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("Types R8: one declared schedule placed in two states constructs, every placement sharing its name, key and reasons", () => {
    const declared = { tick: { pausedBy: ["Away"] } };

    const tick = ({ E }: Tokens) => ({
      tick: { schedule: 1000, send: E["Tick"], paused: { Away: () => false } },
    });

    expect(refusal(() => lampMachine(declared, tick, Option.some(tick)))).toEqual([]);
  });

  it("Types R8, I14: a declared schedule placed nowhere is a warning: the machine constructs (holds today: the declaration is not read yet)", () => {
    expect(
      refusal(() =>
        lampMachine({ tick: {}, idle: {} }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"] },
        })),
      ),
    ).toEqual([]);
  });
});

describe("the twin rule: each refusal the types make has a construction row (Types R8, I13)", () => {
  it("Types I13: a body schedule its definition does not declare is refused ScheduleUndeclared at it", () => {
    expect(
      refusedAt("states.OFF.schedules.tock", () =>
        lampMachine({ tick: {} }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"] },
          tock: { schedule: 1000, send: E["Tick"] },
        })),
      ),
    ).toEqual([["ScheduleUndeclared", "true"]]);
  });

  it("Types I13: a pause reason the declaration does not name is refused ReasonUndeclared at it", () => {
    expect(
      refusedAt(`${TICK}.paused`, () =>
        lampMachine({ tick: { pausedBy: ["Away"] } }, ({ E }) => ({
          tick: {
            schedule: 1000,
            send: E["Tick"],
            paused: { Away: () => false, Awya: () => true },
          },
        })),
      ),
    ).toEqual([["ReasonUndeclared", "true"]]);
  });

  it("Types I13, Q4: a declared reason with no callback in a placement is refused ReasonMissing, a reason named like an Object member included", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: { pausedBy: ["Away", "toString"] } }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"], paused: { Away: () => false } },
        })),
      ),
    ).toEqual([["ReasonMissing", "true"]]);
  });

  it("Types I13, Q4: a declared reason missing from a second placement is refused ReasonMissing at that placement", () => {
    expect(
      refusedAt("states.ON.schedules.tick", () =>
        lampMachine(
          { tick: { pausedBy: ["Away"] } },
          ({ E }) => ({ tick: { schedule: 1000, send: E["Tick"], paused: { Away: () => false } } }),
          Option.some(({ E }: Tokens) => ({ tick: { schedule: 1000, send: E["Tick"] } })),
        ),
      ),
    ).toEqual([["ReasonMissing", "true"]]);
  });

  it("Types I13: a schedule undeclared in a second state is refused ScheduleUndeclared there", () => {
    expect(
      refusedAt("states.ON.schedules.tock", () =>
        lampMachine(
          { tick: {} },
          ({ E }) => ({ tick: { schedule: 1000, send: E["Tick"] } }),
          Option.some(({ E }: Tokens) => ({ tock: { schedule: 1000, send: E["Tick"] } })),
        ),
      ),
    ).toEqual([["ScheduleUndeclared", "true"]]);
  });

  it("Types I13: a keyed schedule with a declared restartOn placed without one is refused RestartOnMissing", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine(
          { tick: { key: { id: Schema.String }, restartOn: Schema.Number } },
          ({ E }) => ({
            tick: { schedule: 1000, send: E["Tick"], keys: () => [{ id: "a" }] },
          }),
        ),
      ),
    ).toEqual([["RestartOnMissing", "true"]]);
  });

  it("Types I13: a keyed declaration placed without keys is refused KeysMissing", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: { key: { id: Schema.String } } }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"] },
        })),
      ),
    ).toEqual([["KeysMissing", "true"]]);
  });

  it("Types I13: keys on a schedule declared without a key are refused KeysUnexpected", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: {} }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"], keys: () => [{ id: "a" }] },
        })),
      ),
    ).toEqual([["KeysUnexpected", "true"]]);
  });

  it("Types I13: restartOn on a schedule declared without restartOn is refused RestartOnUndeclared", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: {} }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"], restartOn: () => 1 },
        })),
      ),
    ).toEqual([["RestartOnUndeclared", "true"]]);
  });

  it("Types I13: a declared restartOn placed without one is refused RestartOnMissing", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: { restartOn: Schema.Number } }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"] },
        })),
      ),
    ).toEqual([["RestartOnMissing", "true"]]);
  });

  it("Types R8: a declared reason follows the name rules: an empty one is InvalidName and a repeated one DuplicateName", () => {
    expect(
      refusedAt("schedules.tick.pausedBy", () =>
        lampMachine({ tick: { pausedBy: ["", "Away", "Away"] } }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"], paused: { "": () => false, Away: () => false } },
        })),
      ),
    ).toEqual([
      ["InvalidName", "true"],
      ["DuplicateName", "true"],
    ]);
  });
});

// RETURN_TYPE: a type guard states the codec type it narrows to.
const isCodec = (value: unknown): value is Schema.Codec<unknown, unknown> => Schema.isSchema(value);

// One field of a schedule's `Compiled.schedules` entry, when it is a codec.
// RETURN_TYPE: a Map or a record, read as one Map, so the check does not fix the field's shape.
const tableOf = (compiled: unknown): ReadonlyMap<unknown, unknown> => {
  const table = Predicate.hasProperty(compiled, "schedules") ? compiled.schedules : undefined;

  if (Predicate.isMap(table)) return table;

  return new Map(Predicate.isObject(table) ? Object.entries(table) : []);
};

const codecOf = (compiled: unknown, name: string, field: "key" | "selection") => {
  const table = tableOf(compiled);
  const entry = table.get(name);
  const codec: unknown = Predicate.hasProperty(entry, field) ? entry[field] : Option.none();

  return Option.isOption(codec) ? Option.filter(codec, isCodec) : Option.none();
};

const keyedLamp = () =>
  lampMachine(
    { poll: { key: { id: Schema.String, n: Schema.Number }, restartOn: Schema.Number }, tick: {} },
    ({ E }) => ({
      poll: {
        schedule: 1000,
        send: E["Tick"],
        keys: () => [{ id: "a", n: 1 }],
        restartOn: () => 1,
      },
      tick: { schedule: 1000, send: E["Tick"] },
    }),
  );

describe("each schedule's codecs in Compiled.schedules (Types R14, I11; Schedules R16)", () => {
  it("Types I11: a keyed schedule's key codec round trips a key through its canonical text", () => {
    const codec = codecOf(compiledOf(keyedLamp()), "poll", "key");
    const key = { id: "a", n: 1 };

    expect(
      Option.map(codec, (c) => Schema.decodeUnknownSync(c)(Schema.encodeUnknownSync(c)(key))),
    ).toEqual(Option.some(key));
  });

  it("Types I11; Schedules I14: a key's text writes its fields in name order whatever the declaration's order, as a contract's keyText", () => {
    const codec = codecOf(
      compiledOf(
        lampMachine({ poll: { key: { zone: Schema.String, id: Schema.String } } }, ({ E }) => ({
          poll: { schedule: 1000, send: E["Tick"], keys: () => [{ zone: "eu", id: "a" }] },
        })),
      ),
      "poll",
      "key",
    );

    expect(Option.map(codec, (c) => Schema.encodeUnknownSync(c)({ zone: "eu", id: "a" }))).toEqual(
      Option.some('{"id":"a","zone":"eu"}'),
    );
  });

  it("Types I11; Schedules I14: the key codec gives NaN, Infinity and -Infinity three texts, so three keys are three timers", () => {
    const codec = codecOf(compiledOf(keyedLamp()), "poll", "key");

    const texts = Option.map(
      codec,
      (c) =>
        new Set(
          [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((n) =>
            Schema.encodeUnknownSync(c)({ id: "a", n }),
          ),
        ).size,
    );

    expect(texts).toEqual(Option.some(3));
  });

  it("Schedules R14: a saved key's text holding a field its declaration no longer has does not decode, so two saved keys never merge into one", () => {
    const codec = codecOf(compiledOf(keyedLamp()), "poll", "key");

    const decodes = (text: string) =>
      Option.map(codec, (c) => Option.isSome(Schema.decodeUnknownOption(c)(text)));

    expect([decodes('{"id":"a","n":1}'), decodes('{"id":"a","n":1,"zone":"eu"}')]).toEqual([
      Option.some(true),
      Option.some(false),
    ]);
  });

  it("Types I11: an unkeyed schedule has no key codec and a schedule with no restartOn no selection codec; a declared restartOn's codec round trips", () => {
    const compiled = compiledOf(keyedLamp());
    const selection = codecOf(compiled, "poll", "selection");
    const table = tableOf(compiled);

    expect(table.has("tick")).toBe(true);
    expect(Option.isNone(codecOf(compiled, "tick", "key"))).toBe(true);
    expect(Option.isNone(codecOf(compiled, "tick", "selection"))).toBe(true);
    expect(
      Option.map(selection, (c) => Schema.decodeUnknownSync(c)(Schema.encodeUnknownSync(c)(5))),
    ).toEqual(Option.some(5));
  });

  it("Types I11, T2: home's Room: a sensor key encoded by its declaration decodes through Compiled.schedules to an equal key", () => {
    const Rooms = machine(Room, ({ S }) => ({
      default: S.OFFLINE,
      states: { ONLINE: { default: S.ONLINE.IDLE } },
    }));

    const codec = codecOf(compiledOf(Rooms), "poll", "key");

    expect(
      Option.map(codec, (c) =>
        Schema.decodeUnknownSync(c)(Schema.encodeUnknownSync(c)({ id: "t1" })),
      ),
    ).toEqual(Option.some({ id: "t1" }));
  });
});
