import { readdirSync, readFileSync } from "node:fs";
import { Cause, Context, Effect, Exit, type Fiber, Layer, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  Outcome,
  transaction,
} from "../index.ts";
import { attachInspector, type Evidence } from "./inspect.ts";
import { Bell, bellOf, platformOver, testing } from "./testing/seam.ts";

class Lamp extends Context.Service<Lamp, { readonly on: Effect.Effect<void> }>()(
  "flow-state-v3/src/host/life.test/Lamp",
) {}

const ring = transaction({
  id: "Life/ring",
  input: {},
  key: [],
  concurrency: "reject",
  services: [Bell],
  commit: (_input, { attempt }) =>
    Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(attempt.id)).pipe(
      Effect.catch((e) => Outcome.unknown(e)),
    ),
});

const Room = definition({
  id: "Life/Room",
  states: ["DARK", "LIT"],
  events: { Switch: { by: Schema.String }, Ring: {} },
  internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({
    ring: ring.outcomes({
      success: E.Rang,
      failure: {},
      notSent: E.NotRung.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const RoomMachine = machine(Room, ({ S, O }) => ({
  default: S.DARK,
  on: { Ring: { actions: [O.ring.commit(() => ({}))] }, Rang: {}, NotRung: {}, Unsure: {} },
  states: { DARK: { on: { Switch: { target: S.LIT } } } },
}));

const rooms = app({ id: "life", machines: { room: RoomMachine } });

const hall = actorRef(RoomMachine, "hall");

const hallId = { machine: "Life/Room", name: "hall" };

const codeOf = (f: () => unknown) => {
  try {
    f();

    return "ran";
  } catch (e) {
    return e instanceof FlowError ? e.code : "threw";
  }
};

// A Runtime over the Stories' clock, with every report kept, not yet ready.
const constructed = (services: Layer.Layer<never, unknown> = bellOf().layer) => {
  const tab = platformOver(new Map(), 1);
  const built = testing.build({ app: rooms, services }, tab.platform);
  const seen: Array<Evidence> = [];
  attachInspector(built.runtime, (e) => void seen.push(e));

  return { tab, built, seen };
};

const disposals = (seen: ReadonlyArray<Evidence>) =>
  seen.filter((e) => e._tag === "RuntimeDisposed").length;

describe("Runtime life (Actors R2, R4, R22, I42)", () => {
  it("Actors R4: before ready, disposeActor and forget reject RuntimeNotReady and start nothing", () => {
    const { built, seen } = constructed();

    expect(codeOf(() => built.runtime.disposeActor(hall))).toBe("RuntimeNotReady");
    expect(codeOf(() => testing.forget(built, hallId))).toBe("RuntimeNotReady");
    expect(seen).toEqual([]);
  });

  it("Actors R22: after dispose, forget rejects RuntimeDisposed and disposeActor is dropped", () => {
    const { built } = constructed();
    Effect.runSync(built.runtime.ready());
    Effect.runSync(built.runtime.dispose());

    expect(codeOf(() => testing.forget(built, hallId))).toBe("RuntimeDisposed");
    expect(codeOf(() => built.runtime.disposeActor(hall))).toBe("ran");
  });

  it("Actors R2, R4: a failed bootstrap is shared by every later ready with no retry; ensureActor rejects RuntimeNotReady; dispose ends at once", () => {
    let tries = 0;

    const broken = Layer.effect(
      Lamp,
      Effect.suspend(() => {
        tries += 1;

        return Effect.fail("no power");
      }),
    );

    const { built, seen } = constructed(broken);
    const first = Effect.runSync(Effect.exit(built.runtime.ready()));
    const second = Effect.runSync(Effect.exit(built.runtime.ready()));

    expect(Exit.isFailure(first) && Exit.isFailure(second)).toBe(true);
    expect(tries).toBe(1);
    expect(codeOf(() => built.runtime.ensureActor(hall))).toBe("RuntimeNotReady");

    Effect.runSync(built.runtime.dispose());

    expect(disposals(seen)).toBe(1);
  });

  it("Actors R2, R22: dispose before ready ends at once and reports once; ready then rejects RuntimeDisposed, and a second dispose restarts nothing", () => {
    const { built, seen } = constructed();

    Effect.runSync(built.runtime.dispose());
    Effect.runSync(built.runtime.dispose());

    const ready = Effect.runSync(
      built.runtime
        .ready()
        .pipe(Effect.match({ onSuccess: () => "ran", onFailure: (e) => e.code })),
    );

    expect(ready).toBe("RuntimeDisposed");
    expect(codeOf(() => built.runtime.ensureActor(hall))).toBe("RuntimeDisposed");
    expect(disposals(seen)).toBe(1);
  });

  it("Actors R22: while the disposal waits for a call on the wire, ensureActor and send reject RuntimeDisposed", () => {
    const { tab, built, seen } = constructed();
    Effect.runSync(built.runtime.ready());
    const room = built.runtime.ensureActor(hall);
    room.send({ _tag: "Ring" });
    tab.settle();
    const disposing = Effect.runFork(built.runtime.dispose());
    tab.settle();

    expect(disposals(seen)).toBe(0);
    expect(codeOf(() => built.runtime.ensureActor(hall))).toBe("RuntimeDisposed");
    expect(codeOf(() => room.send({ _tag: "Switch", by: "me" }))).toBe("RuntimeDisposed");

    tab.advance(5000);

    expect(disposing.pollUnsafe()).toBeDefined();
  });
});

const Shelf = definition({
  id: "Life/Shelf",
  persist: true,
  states: ["ON"],
  events: { Poke: {} },
  memory: {},
  operations: () => ({}),
});

const ShelfMachine = machine(Shelf, ({ S }) => ({ default: S.ON, states: { ON: {} } }));

const shelves = app({ id: "shelves", machines: { shelf: ShelfMachine } });

const shelfId = { machine: "Life/Shelf", name: "top" };

const shelfRecord =
  '{"format":1,"machine":"Life/Shelf","name":"top","state":"ON","memory":{},"schedules":[]}';

// A persisted Runtime over a store holding one actor record, whose bootstrap waits for its service
// until `acquire` answers it, so the life stays Booting.
const booting = () => {
  const store = new Map([["actor/Life/Shelf/top", shelfRecord]]);
  const tab = platformOver(store, 1);
  const acquiring: Array<(answer: Effect.Effect<void, string>) => void> = [];

  const layer = Layer.effect(
    Lamp,
    Effect.callback<void, string>((resume) => void acquiring.push(resume)).pipe(
      Effect.as(Lamp.of({ on: Effect.void })),
    ),
  );

  const built = testing.build(
    { app: shelves, services: layer, scope: "life", persistence: { captureMs: 0 } },
    tab.platform,
  );

  const seen: Array<Evidence> = [];
  attachInspector(built.runtime, (e) => void seen.push(e));
  const first = Effect.runFork(built.runtime.ready());
  tab.settle();

  const acquire = (answer: Effect.Effect<void, string>) => {
    for (const resume of acquiring.splice(0)) resume(answer);
    tab.settle();
  };

  return { store, tab, built, seen, first, acquire, acquiring };
};

// How a ready fiber ended: still pending, ran, or the code of the FlowError it failed with.
const codeAt = (fiber: Fiber.Fiber<void, FlowError>) =>
  Option.match(Option.fromUndefinedOr(fiber.pollUnsafe()), {
    onNone: () => "pending",
    onSome: (exit) =>
      Exit.isSuccess(exit)
        ? "ran"
        : Option.match(Cause.findErrorOption(exit.cause), {
            onNone: () => "threw",
            onSome: (e) => e.code,
          }),
  });

describe("each reachable admit cell through the Runtime's calls (Actors T24, I42)", () => {
  it("Actors I42: while Booting, a second ready waits for the one bootstrap, and ensureActor, disposeActor and forget reject RuntimeNotReady", () => {
    const { built, first, acquire, acquiring } = booting();
    const second = Effect.runFork(built.runtime.ready());

    expect(acquiring).toHaveLength(1);
    expect(codeAt(second)).toBe("pending");
    expect(codeOf(() => built.runtime.ensureActor(actorRef(ShelfMachine, "top")))).toBe(
      "RuntimeNotReady",
    );
    expect(codeOf(() => built.runtime.disposeActor(actorRef(ShelfMachine, "top")))).toBe(
      "RuntimeNotReady",
    );

    acquire(Effect.void);

    expect([codeAt(first), codeAt(second)]).toEqual(["ran", "ran"]);
  });

  it("Actors T24: a forget while Booting rejects RuntimeNotReady and the record survives into the boot", () => {
    const { store, built, acquire } = booting();

    expect(codeOf(() => testing.forget(built, shelfId))).toBe("RuntimeNotReady");

    acquire(Effect.void);

    expect(store.has("actor/Life/Shelf/top")).toBe(true);
    expect(built.driver.world().records.has("Life/Shelf/top")).toBe(true);
  });

  it("Actors I42: after a failed bootstrap, disposeActor and forget reject RuntimeNotReady", () => {
    const { built, acquire } = booting();
    acquire(Effect.fail("no power"));

    expect(codeOf(() => built.runtime.disposeActor(actorRef(ShelfMachine, "top")))).toBe(
      "RuntimeNotReady",
    );
    expect(codeOf(() => testing.forget(built, shelfId))).toBe("RuntimeNotReady");
  });

  it("Actors T24: a dispose while Booting makes ready fail RuntimeDisposed, its service's late failure included, with one disposal", () => {
    const { built, seen, first, acquire } = booting();
    Effect.runSync(built.runtime.dispose());
    acquire(Effect.fail("no power"));

    expect(codeAt(first)).toBe("RuntimeDisposed");
    expect(disposals(seen)).toBe(1);
  });

  it("Actors I42: while Disposing, ready and forget reject RuntimeDisposed, and disposeActor and a second dispose are dropped", () => {
    const { tab, built, seen } = constructed();
    Effect.runSync(built.runtime.ready());
    const room = built.runtime.ensureActor(hall);
    room.send({ _tag: "Ring" });
    tab.settle();
    const disposing = Effect.runFork(built.runtime.dispose());
    tab.settle();
    const again = Effect.runFork(built.runtime.dispose());
    tab.settle();

    const ready = Effect.runSync(
      built.runtime
        .ready()
        .pipe(Effect.match({ onSuccess: () => "ran", onFailure: (e) => e.code })),
    );

    expect(ready).toBe("RuntimeDisposed");
    expect(codeOf(() => testing.forget(built, hallId))).toBe("RuntimeDisposed");
    expect(codeOf(() => built.runtime.disposeActor(hall))).toBe("ran");
    expect(disposals(seen)).toBe(0);

    tab.advance(5000);

    expect([disposing.pollUnsafe(), again.pollUnsafe()].every((e) => e !== undefined)).toBe(true);
    expect(disposals(seen)).toBe(1);
  });
});

const HOST = new URL("./", import.meta.url);

const hostSources = () =>
  readdirSync(HOST, { recursive: true, encoding: "utf8" })
    // The test tooling's own script state (a Story step after disposeRuntime) is not the Runtime's.
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.startsWith("testing/"))
    .map((f) => [f, readFileSync(new URL(f, HOST), "utf8")] as const);

const LIFE_TAG = /\$is\("(?:Inert|Booting|Open|Failed|Disposing|Disposed)"\)|\blife\._tag\b/u;

const FLAG = /\blet (?:started|open|closed|booted|disposed|admitting)\b/u;

describe("one owner of the Runtime's life (Actors I42)", () => {
  it("Actors I42: no host module matches or reads a life tag or keeps a lifecycle flag; admission follows admit alone", () => {
    const deciders = hostSources().flatMap(([f, text]) =>
      LIFE_TAG.test(text) || FLAG.test(text) ? [f] : [],
    );

    expect(deciders).toEqual([]);
  });
});
