import { readdirSync, readFileSync } from "node:fs";
import { Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Room } from "../../fixtures/home/machines/room.ts";
import { manifests } from "../../fixtures/index.ts";
import { definition, Flow, machine } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { refusal } from "../refusals.ts";

// Declared schedules, the runtime half: the declaration on the definition, the body's placement
// checked against it at construction (the twin rule), and each schedule's key and selection codec
// in `Compiled.schedules`. Every check is inverted (`it.fails`) until the declaration lands; the
// types follow later, so these call `definition` and `machine` as plain JavaScript does.

type Tokens = {
  readonly S: Readonly<Record<string, unknown>>;
  readonly E: Readonly<Record<string, unknown>>;
};

const untyped: {
  readonly definition: (config: unknown) => Tokens;
  readonly machine: (
    definition: unknown,
    body: (tokens: Tokens) => unknown,
  ) => { readonly compiled: unknown };
} = loose({ definition, machine });

// A keyed schedule's body: wrapped in Flow.keyed while that wrapper exists, plain once keys are
// declared, so each keyed check fails today for its own rule.
const keyed: (config: unknown) => unknown = Predicate.hasProperty(Flow, "keyed")
  ? loose(Flow.keyed)
  : (config) => config;

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
            poll: keyed({
              schedule: 1000,
              send: E["Tick"],
              keys: () => [{ id: "a" }],
              paused: { Away: () => false },
              restartOn: () => 1,
            }),
          }),
        ),
      ),
    ).toEqual([]);
  });

  it.fails("Types R8: one declared schedule placed in two states constructs, every placement sharing its name, key and reasons", () => {
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

  it.fails("Types R8: Flow.keyed is gone; a keyed schedule is one whose declaration has a key", () => {
    expect(Object.keys(Flow)).not.toContain("keyed");
  });
});

describe("the twin rule: each refusal the types make has a construction row (Types R8, I13)", () => {
  it.fails("Types I13: a body schedule its definition does not declare is refused ScheduleUndeclared at it", () => {
    expect(
      refusedAt("states.OFF.schedules.tock", () =>
        lampMachine({ tick: {} }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"] },
          tock: { schedule: 1000, send: E["Tick"] },
        })),
      ),
    ).toEqual([["ScheduleUndeclared", "true"]]);
  });

  it.fails("Types I13: a pause reason the declaration does not name is refused ReasonUndeclared at it", () => {
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

  it.fails("Types I13, Q4: a declared reason with no callback in a placement is refused ReasonMissing, a reason named like an Object member included", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: { pausedBy: ["Away", "toString"] } }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"], paused: { Away: () => false } },
        })),
      ),
    ).toEqual([["ReasonMissing", "true"]]);
  });

  it.fails("Types I13, Q4: a declared reason missing from a second placement is refused ReasonMissing at that placement", () => {
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

  it.fails("Types I13: a schedule undeclared in a second state is refused ScheduleUndeclared there", () => {
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

  it.fails("Types I13: a keyed schedule with a declared restartOn placed without one is refused RestartOnMissing", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine(
          { tick: { key: { id: Schema.String }, restartOn: Schema.Number } },
          ({ E }) => ({
            tick: keyed({ schedule: 1000, send: E["Tick"], keys: () => [{ id: "a" }] }),
          }),
        ),
      ),
    ).toEqual([["RestartOnMissing", "true"]]);
  });

  it.fails("Types I13: a keyed declaration placed without keys is refused KeysMissing", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: { key: { id: Schema.String } } }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"] },
        })),
      ),
    ).toEqual([["KeysMissing", "true"]]);
  });

  it.fails("Types I13: keys on a schedule declared without a key are refused KeysUnexpected", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: {} }, ({ E }) => ({
          tick: keyed({ schedule: 1000, send: E["Tick"], keys: () => [{ id: "a" }] }),
        })),
      ),
    ).toEqual([["KeysUnexpected", "true"]]);
  });

  it.fails("Types I13: restartOn on a schedule declared without restartOn is refused RestartOnUndeclared", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: {} }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"], restartOn: () => 1 },
        })),
      ),
    ).toEqual([["RestartOnUndeclared", "true"]]);
  });

  it.fails("Types I13: a declared restartOn placed without one is refused RestartOnMissing", () => {
    expect(
      refusedAt(TICK, () =>
        lampMachine({ tick: { restartOn: Schema.Number } }, ({ E }) => ({
          tick: { schedule: 1000, send: E["Tick"] },
        })),
      ),
    ).toEqual([["RestartOnMissing", "true"]]);
  });

  it.fails("Types R8: a declared reason follows the name rules: an empty one is InvalidName and a repeated one DuplicateName", () => {
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
const tableOf = (compiled: unknown) =>
  Predicate.hasProperty(compiled, "schedules") ? compiled.schedules : undefined;

const codecOf = (compiled: unknown, name: string, field: "key" | "selection") => {
  const table = tableOf(compiled);
  const entry = Predicate.isMap(table) ? table.get(name) : undefined;
  const codec: unknown = Predicate.hasProperty(entry, field) ? entry[field] : Option.none();

  return Option.isOption(codec) ? Option.filter(codec, isCodec) : Option.none();
};

const keyedLamp = () =>
  lampMachine(
    { poll: { key: { id: Schema.String, n: Schema.Number }, restartOn: Schema.Number }, tick: {} },
    ({ E }) => ({
      poll: keyed({
        schedule: 1000,
        send: E["Tick"],
        keys: () => [{ id: "a", n: 1 }],
        restartOn: () => 1,
      }),
      tick: { schedule: 1000, send: E["Tick"] },
    }),
  );

describe("each schedule's codecs in Compiled.schedules (Types R14, I11; Schedules R16)", () => {
  it.fails("Types I11: a keyed schedule's key codec round trips a key through its canonical text", () => {
    const codec = codecOf(keyedLamp().compiled, "poll", "key");
    const key = { id: "a", n: 1 };

    expect(
      Option.map(codec, (c) => Schema.decodeUnknownSync(c)(Schema.encodeUnknownSync(c)(key))),
    ).toEqual(Option.some(key));
  });

  it.fails("Types I11; Schedules I14: a key's text writes its fields in name order whatever the declaration's order, as a contract's keyText", () => {
    const codec = codecOf(
      lampMachine({ poll: { key: { zone: Schema.String, id: Schema.String } } }, ({ E }) => ({
        poll: keyed({ schedule: 1000, send: E["Tick"], keys: () => [{ zone: "eu", id: "a" }] }),
      })).compiled,
      "poll",
      "key",
    );

    expect(Option.map(codec, (c) => Schema.encodeUnknownSync(c)({ zone: "eu", id: "a" }))).toEqual(
      Option.some('{"id":"a","zone":"eu"}'),
    );
  });

  it.fails("Types I11; Schedules I14: the key codec gives NaN, Infinity and -Infinity three texts, so three keys are three timers", () => {
    const codec = codecOf(keyedLamp().compiled, "poll", "key");

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

  it.fails("Schedules R14: a saved key's text holding a field its declaration no longer has does not decode, so two saved keys never merge into one", () => {
    const codec = codecOf(keyedLamp().compiled, "poll", "key");

    const decodes = (text: string) =>
      Option.map(codec, (c) => Option.isSome(Schema.decodeUnknownOption(c)(text)));

    expect([decodes('{"id":"a","n":1}'), decodes('{"id":"a","n":1,"zone":"eu"}')]).toEqual([
      Option.some(true),
      Option.some(false),
    ]);
  });

  it.fails("Types I11: an unkeyed schedule has no key codec and a schedule with no restartOn no selection codec; a declared restartOn's codec round trips", () => {
    const { compiled } = keyedLamp();
    const selection = codecOf(compiled, "poll", "selection");
    const table = tableOf(compiled);

    expect(Predicate.isMap(table) && table.has("tick")).toBe(true);
    expect(Option.isNone(codecOf(compiled, "tick", "key"))).toBe(true);
    expect(Option.isNone(codecOf(compiled, "tick", "selection"))).toBe(true);
    expect(
      Option.map(selection, (c) => Schema.decodeUnknownSync(c)(Schema.encodeUnknownSync(c)(5))),
    ).toEqual(Option.some(5));
  });

  it.fails("Types I11, T2: home's Room: a sensor key encoded by its declaration decodes through Compiled.schedules to an equal key", () => {
    const Rooms = machine(Room, ({ S }) => ({
      default: S.OFFLINE,
      states: { ONLINE: { default: S.ONLINE.IDLE } },
    }));

    const codec = codecOf(Rooms.compiled, "poll", "key");

    expect(
      Option.map(codec, (c) =>
        Schema.decodeUnknownSync(c)(Schema.encodeUnknownSync(c)({ id: "t1" })),
      ),
    ).toEqual(Option.some({ id: "t1" }));
  });
});

describe("every fixture declares the schedules it places (Types R8, I11, T2)", () => {
  it.fails("Types I11: each schedule a fixture machine places has its Compiled.schedules entry", () => {
    const placed = manifests.flatMap((manifest) =>
      Object.values(manifest.app.machines).flatMap((entry) => {
        const { compiled } = "machine" in entry ? entry.machine : entry;
        const table = tableOf(compiled);

        return [...compiled.states.values()].flatMap((node) =>
          node.schedules.map((schedule) => ({
            at: `${manifest.name}/${compiled.id}/${schedule.name}`,
            declared: Predicate.isMap(table) && table.has(schedule.name),
          })),
        );
      }),
    );

    expect(placed.length).toBeGreaterThan(0);
    expect(placed.filter(({ declared }) => !declared).map(({ at }) => at)).toEqual([]);
  });
});

// Every TypeScript file under a package folder, with its text.
const filesUnder = (folder: string) =>
  readdirSync(new URL(`../../${folder}/`, import.meta.url), { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .map((path) => ({
      path: `${folder}/${path}`,
      text: readFileSync(new URL(`../../${folder}/${path}`, import.meta.url), "utf8"),
    }));

describe("Flow.keyed is gone from the package (Types R8)", () => {
  it.fails("Types R8: no source or fixture writes Flow.keyed, KeyedConfig, KeyedSchedule, ScheduleKey, ErasedEntry or the keyed mark", () => {
    expect(
      [...filesUnder("src"), ...filesUnder("fixtures")]
        .filter(({ text }) =>
          /Flow\.keyed|KeyedConfig|KeyedSchedule|ScheduleKey\b|ErasedEntry|"~keyed"|"keyed"/u.test(
            text,
          ),
        )
        .map(({ path }) => path),
    ).toEqual([]);
  });
});
