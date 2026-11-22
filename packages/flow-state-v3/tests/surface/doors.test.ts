import { readdirSync, readFileSync } from "node:fs";
import { Effect, Option, Predicate, Schema } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { registrationOf } from "../../src/entry.ts";
import * as Testing from "../../src/host/testing/index.ts";
import * as Flow from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { refusal } from "../refusals.ts";
import { manifests } from "../../fixtures/index.ts";
import { surfaceOf } from "./surface.ts";

// The hostile table for construction trust, each row a test.

const MADE = Symbol.for("flow-state/Made");

// Where a made value keeps what the core calls: the one key a face walk skips.
const INTERNALS = Symbol.for("flow-state/Internals");

const ping = Flow.transaction({
  id: "Doors/ping",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed({}),
});

const Lamp = Flow.definition({
  id: "Doors/Lamp",
  states: ["OFF", "ON"],
  events: { Flip: {} },
  internalEvents: { Pinged: {}, Unsure: Flow.Flow.uncertain({}) },
  memory: { id: Flow.Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    ping: ping.outcomes({ success: E.Pinged, failure: {}, unknown: E.Unsure }),
  }),
  schedules: { tick: {} },
});

const Other = Flow.definition({
  id: "Doors/Other",
  states: ["OFF", "ON"],
  events: { Flip: {} },
});

// A bound contract, built from Lamp's tokens as its operations callback builds one.
const pingBound = ping.outcomes({ success: Lamp.E.Pinged, failure: {}, unknown: Lamp.E.Unsure });

const LampMachine = Flow.machine(Lamp, ({ S }) => ({
  default: S.OFF,
  states: { OFF: { on: { Flip: S.ON } }, ON: { on: { Flip: S.OFF } } },
}));

// A refusal as `[reason, path]`: the finding's reason when it has one, else its code.
const reasons = (construct: () => unknown) =>
  refusal(construct, (d) => [String(d.details.reason ?? d.code), d.path.join(".")]);

// A value each of whose traps throws.
const trapped = () => {
  const fail = () => {
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the hostile value: every trap of it throws
    throw new Error("trapped");
  };

  return new Proxy(
    {},
    { get: fail, has: fail, ownKeys: fail, getOwnPropertyDescriptor: fail, getPrototypeOf: fail },
  );
};

describe("the hostile table: a copy is never taken for a made value (Operations R10, I19)", () => {
  it("Operations R10: a spread copy of a definition is refused at machine() as WrongKind, never taken as made", () => {
    expect(reasons(() => Flow.machine(loose({ ...Lamp }), () => loose({})))).toEqual([
      ["WrongKind", "definition"],
    ]);
  });

  it("Operations R10: a spread copy of a machine is refused at app() as WrongKind at its entry", () => {
    expect(
      reasons(() => Flow.app({ id: "Doors", machines: { lamp: loose({ ...LampMachine }) } })),
    ).toEqual([["WrongKind", "machines.lamp"]]);
  });

  it("Operations R10: a spread copy of a state token as a body's default is refused as WrongKind", () => {
    expect(
      reasons(() => Flow.machine(Lamp, ({ S }) => ({ default: loose({ ...S.OFF }) }))),
    ).toEqual([["WrongKind", "default"]]);
  });

  it("Operations R10: a copied event token as a schedule's send is refused as WrongKind, never ForeignToken", () => {
    expect(
      reasons(() =>
        Flow.machine(Lamp, ({ S, E }) => ({
          default: S.OFF,
          states: {
            OFF: {
              on: { Flip: { target: S.ON, actions: [] } },
              schedules: {
                tick: {
                  schedule: 1000,
                  send: loose(Object.assign(() => undefined, E.Flip)),
                },
              },
            },
          },
        })),
      ).map(([reason]) => reason),
    ).toEqual(["WrongKind"]);
  });

  it("Operations R10: another definition's token is refused as ForeignToken at its path (holds today: the owner compare)", () => {
    expect(reasons(() => Flow.machine(Lamp, () => ({ default: loose(Other.S.OFF) })))).toEqual([
      ["ForeignToken", "default"],
    ]);
  });

  it("Operations R10: a definition argument whose every read throws is one Defect finding at the definition's path, not at the call's name", () => {
    expect(reasons(() => Flow.machine(loose(trapped()), () => loose({})))).toEqual([
      ["Defect", "definition"],
    ]);
  });

  it("Operations R10: an object made on a made value's prototype by hand, with no internals, is refused as WrongKind (holds today: definitions have no shared prototype yet)", () => {
    const prototype: unknown = Object.getPrototypeOf(Lamp);
    const forged: unknown = Predicate.isObject(prototype) ? Object.create(prototype) : {};

    expect(reasons(() => Flow.machine(loose(forged), () => loose({})))).toEqual([
      ["WrongKind", "definition"],
    ]);
  });
});

// A second copy of Flow's modules in this process, as a page that bundles Flow twice has.
const secondCopy = async () => {
  vi.resetModules();
  const copy = await import("../../src/index.ts");

  const Twin = copy.definition({
    id: "Doors/Twin",
    states: ["OFF", "ON"],
    events: { Flip: {} },
  });

  const TwinMachine = copy.machine(Twin, ({ S }) => ({
    default: S.OFF,
    states: { OFF: { on: { Flip: S.ON } } },
  }));

  return { copy, Twin, TwinMachine };
};

describe("a second loaded copy of Flow (Operations R10, Q6)", () => {
  it("Operations R10: a definition and machine made by a second loaded copy are read as made by the first copy's doors, and run (holds today: the string marks are shared across copies)", async () => {
    const { copy, Twin, TwinMachine } = await secondCopy();

    expect(copy.definition).not.toBe(Flow.definition);
    expect(reasons(() => Flow.machine(Twin, ({ S }) => ({ default: S.OFF })))).toEqual([]);

    const runtime = Flow.runtimeSetup({
      app: Flow.app({ id: "Doors/twin", machines: { twin: TwinMachine } }),
    }).construct();

    await Effect.runPromise(runtime.ready());
    const actor = runtime.ensureActor(Flow.actorRef(TwinMachine, "one"));
    actor.send(Twin.E.Flip());

    expect(Option.map(actor.getSnapshot(), (s) => s.state)).toEqual(Option.some("ON"));
    await Effect.runPromiseExit(runtime.dispose());
  });

  it("Operations R10, Q6: a second loaded copy's values carry the same registered Made brand", async () => {
    const { Twin, TwinMachine } = await secondCopy();

    expect([MADE in Twin, MADE in TwinMachine]).toEqual([true, true]);
  });
});

// A value's own properties, string and symbol keyed, enumerable or hidden, but for the internals
// key: a data property's value, or the mark that it is an accessor, which plain data never holds.
const ownProperties = (value: unknown) =>
  (Predicate.isObjectOrArray(value) || Predicate.isFunction(value)
    ? Reflect.ownKeys(value)
    : []
  ).flatMap((key) => {
    const property = Predicate.isObject(value)
      ? Object.getOwnPropertyDescriptor(value, key)
      : undefined;

    if (property === undefined || key === INTERNALS) return [];

    const held: unknown = property.value;

    return [{ key: String(key), accessor: !("value" in property), held }];
  });

// What a Map or a Set holds, keys and values, each as a held entry: a collection is part of a face
// as much as its own fields are.
const collected = (value: unknown) => {
  if (value instanceof Map)
    return [...value.entries()].flatMap(([key, held]: readonly [unknown, unknown], i) => [
      { key: `[${i}].key`, accessor: false, held: key },
      { key: `[${String(key)}]`, accessor: false, held },
    ]);

  return value instanceof Set
    ? [...value].map((held: unknown, i) => ({ key: `[${i}]`, accessor: false, held }))
    : [];
};

// Whether a collection still changes in place: its writer is the native one.
const writable = (value: unknown) =>
  (value instanceof Map && value.set === Map.prototype.set) ||
  (value instanceof Set && value.add === Set.prototype.add);

// Every value the walk meets on a made value's face: the functions on it no door registered, and
// the objects on it that are not frozen or hold an accessor.
const facesOf = (roots: ReadonlyArray<readonly [string, unknown]>) => {
  const seen = new Set<unknown>();
  const unregistered: Array<string> = [];
  const unfrozen: Array<string> = [];

  const judge = (value: unknown, path: string) => {
    if (Predicate.isFunction(value) && Option.isNone(registrationOf(value)))
      unregistered.push(path);

    if (!Object.isFrozen(value) || writable(value)) unfrozen.push(path);
  };

  const visit = (value: unknown, path: string) => {
    if (!(Predicate.isObjectOrArray(value) || Predicate.isFunction(value))) return;

    if (Schema.isSchema(value) || Effect.isEffect(value) || seen.has(value)) return;

    seen.add(value);
    judge(value, path);

    for (const { key, accessor, held } of [...ownProperties(value), ...collected(value)])
      if (accessor) unfrozen.push(`${path}.${key}`);
      else visit(held, `${path}.${key}`);
  };

  for (const [path, root] of roots) visit(root, path);

  return { unregistered, unfrozen };
};

const madeRoots: ReadonlyArray<readonly [string, unknown]> = [
  ["ping", ping],
  ["Lamp", Lamp],
  ["LampMachine", LampMachine],
  ...manifests.map((manifest) => [manifest.name, manifest.app] as const),
];

describe("made values (Operations R10, I19)", () => {
  it("Operations I19: every function on a made value's face, inert data included and inside its Maps and Sets, is a door's", () => {
    expect(facesOf(madeRoots).unregistered).toEqual([]);
  });

  it("Operations R10: a made value's face is deeply frozen data, its Maps and Sets included", () => {
    expect(facesOf(madeRoots).unfrozen).toEqual([]);
  });

  it("Operations R10: the config a definition was given is frozen deeply, though it is off the face, so a later write to a shared config object refuses", () => {
    const states = ["OFF", { ON: ["DIM", "BRIGHT"] }] as const;
    const events = { Flip: {}, Dim: { level: Schema.Number } };
    const memory = { level: Flow.Flow.initial(Schema.Number, 0) };
    const schedules = { tick: { pausedBy: ["Away"] } } as const;

    void Flow.definition({ id: "Doors/Frozen", states, events, memory, schedules });

    expect(
      facesOf([
        ["states", states],
        ["events", events],
        ["memory", memory],
        ["schedules", schedules],
      ]).unfrozen,
    ).toEqual([]);
  });

  it("Operations R10: a definition, a machine, a contract, a bound contract, a state token, a ref and an app each carry the registered Made brand on one shared frozen prototype", () => {
    const made = [
      Lamp,
      LampMachine,
      ping,
      pingBound,
      Lamp.S.OFF,
      Flow.actorRef(LampMachine, "one"),
      Flow.app({ id: "Doors", machines: { lamp: LampMachine } }),
    ];

    const prototypes = new Set(
      made.map((value) => {
        const prototype: unknown = Object.getPrototypeOf(value);

        return prototype;
      }),
    );

    const [shared] = prototypes;

    expect(made.map((value) => MADE in value)).toEqual(made.map(() => true));
    expect(prototypes.size).toBe(1);
    expect(Object.isFrozen(shared)).toBe(true);
  });

  it("Operations R10: what the core calls on a made value (a bound contract's textOfKey and call, an operation token's make) is off its face", () => {
    const token = Lamp.O.ping.commit(() => ({ id: "x" }));

    expect([
      Object.keys(pingBound).filter((key) => key === "textOfKey" || key === "call"),
      Object.keys(token).filter((key) => key === "make"),
    ]).toEqual([[], []]);
  });
});

describe("the testing route's doors (Operations R10, I19)", () => {
  it("Operations I19: every function the testing route exports is a door's", () => {
    expect(surfaceOf([["testing", Testing]]).stray).toEqual([]);
  });

  it("Operations R10: the testing route's defineConfig, Story.app, samplesOf, print and pairSweep given null each refuse with a FlowError, never a return", () => {
    const calls: ReadonlyArray<readonly [string, () => unknown]> = [
      ["defineConfig", () => Testing.defineConfig(loose(null))],
      ["Story.app", () => Testing.Story.app(loose(null), loose(null))],
      ["samplesOf", () => Testing.samplesOf(loose(null))],
      ["print", () => Testing.print(loose(null), "x", [])],
      ["pairSweep", () => Testing.pairSweep(loose(null), loose(null))],
    ];

    const endings = calls.map(([name, call]) => {
      try {
        call();

        return [name, "returned"];
      } catch (error) {
        return [name, error instanceof Flow.FlowError ? "FlowError" : "raw"];
      }
    });

    expect(endings.filter(([, ending]) => ending !== "FlowError")).toEqual([]);
  });
});

describe("a door refuses a wrong kind with every finding (Types R4, R11; Operations R10)", () => {
  it("Types R4, R11: machine() given neither a definition nor a body function raises once, naming both arguments", () => {
    expect(reasons(() => Flow.machine(loose(7), loose(8)))).toEqual([
      ["WrongKind", "definition"],
      ["WrongKind", "body"],
    ]);
  });
});

// Every production source file of the package, by its path under `src/`.
const sources = () =>
  readdirSync(new URL("../../src/", import.meta.url), { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
    .map((path) => ({
      path,
      text: readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8"),
    }));

describe("the marks are gone (Operations R10)", () => {
  it("Operations R10: no source outside the testing route writes or reads a ~flow, ~token, ~owner, ~path, ~payload, ~walk or ~names mark", () => {
    const marked = sources()
      .filter(({ path }) => !path.startsWith("host/testing/"))
      .filter(({ text }) => /"~(flow|token|owner|path|payload|walk|names)"/u.test(text))
      .map(({ path }) => path);

    expect(marked).toEqual([]);
  });

  it("Operations R10: no source disables flow-state/no-mark-probe", () => {
    expect(
      sources()
        .filter(({ text }) => text.includes("flow-state/no-mark-probe"))
        .map(({ path }) => path),
    ).toEqual([]);
  });
});
