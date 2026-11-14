import assert from "node:assert/strict";
import { Effect, Exit, Fiber, Layer, Option, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  Outcome,
  resource,
  transaction,
} from "../index.ts";
import { CallResult, Input } from "../core/step.ts";
import { attachInspector, type Evidence } from "./inspect.ts";
import { testing } from "./testing.ts";
import { Bell, bellOf, bootWith, endingsOf, pageOver, tagsOf } from "./testing/page.ts";

const ring = transaction({
  id: "Test/ring",
  input: { tone: Schema.String },
  key: [],
  concurrency: "reject",
  services: [Bell],
  commit: (_input, { attempt }) =>
    Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(attempt.id)).pipe(
      Effect.catch((e) => Outcome.unknown(e)),
    ),
});

const Door = definition({
  id: "Test/Door",
  persist: true,
  states: ["SHUT"],
  events: { Ring: {} },
  internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({
    ring: ring.outcomes({
      success: E.Rang,
      failure: { NotSent: E.NotRung.from((e: { readonly why: string }) => ({ why: e.why })) },
      unknown: E.Unsure,
    }),
  }),
});

const DoorMachine = machine(Door, ({ S, O }) => ({
  default: S.SHUT,
  on: {
    Ring: { actions: [O.ring.commit(() => ({ tone: "low" }))] },
    Rang: {},
    NotRung: {},
    Unsure: { actions: [O.ring.retry] },
  },
}));

const doors = app({ id: "test", machines: { door: DoorMachine } });

// An unkeyed write whose key-less members run from external events, outside any ending's handler.
const Gate = definition({
  id: "Test/Gate",
  states: ["OPEN"],
  events: { Ring: {}, Again: {}, Stop: {} },
  internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({
    ring: ring.outcomes({
      success: E.Rang,
      failure: { NotSent: E.NotRung.from((e: { readonly why: string }) => ({ why: e.why })) },
      unknown: E.Unsure,
    }),
  }),
});

const GateMachine = machine(Gate, ({ S, O }) => ({
  default: S.OPEN,
  on: {
    Ring: { actions: [O.ring.commit(() => ({ tone: "high" }))] },
    Again: { guard: [O.ring.retryable({ times: 3 })], actions: [O.ring.retry] },
    Stop: { actions: [O.ring.cancel] },
    Rang: {},
    NotRung: {},
    Unsure: {},
  },
}));

const gates = app({ id: "test", machines: { gate: GateMachine } });

const side = { machine: "Test/Gate", name: "side" };

const front = { machine: "Test/Door", name: "front" };

// A write whose unknown mapper throws: its ending's turn is refused at every try.
const Jam = definition({
  id: "Test/Jam",
  states: ["OPEN"],
  events: { Ring: {} },
  internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({
    ring: ring.outcomes({
      success: E.Rang,
      failure: { NotSent: E.NotRung.from((e: { readonly why: string }) => ({ why: e.why })) },
      unknown: E.Unsure.from(() => {
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the case is an author mapper that throws
        throw new Error("the mapper throws");
      }),
    }),
  }),
});

const JamMachine = machine(Jam, ({ S, O }) => ({
  default: S.OPEN,
  on: {
    Ring: { actions: [O.ring.commit(() => ({ tone: "jam" }))] },
    Rang: {},
    NotRung: {},
    Unsure: {},
  },
}));

const jammed = { machine: "Test/Jam", name: "jam" };

// A commit that holds off its interrupt until it answers, and an unknown mapper that records the
// value it is given in `heard`.
const stubborn = transaction({
  id: "Test/stubborn",
  input: { tone: Schema.String },
  key: [],
  concurrency: "reject",
  services: [Bell],
  commit: (_input, { attempt }) =>
    Effect.uninterruptible(Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(attempt.id))),
});

const latchOver = (heard: Array<unknown>) => {
  const Latch = definition({
    id: "Test/Latch",
    states: ["OPEN"],
    events: { Ring: {}, Stop: {} },
    internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
    memory: {},
    operations: ({ E }) => ({
      ring: stubborn.outcomes({
        success: E.Rang,
        failure: { NotSent: E.NotRung.from((e: { readonly why: string }) => ({ why: e.why })) },
        unknown: E.Unsure.from((value: unknown) => {
          heard.push(value);

          return {};
        }),
      }),
    }),
  });

  const LatchMachine = machine(Latch, ({ S, O }) => ({
    default: S.OPEN,
    on: {
      Ring: { actions: [O.ring.commit(() => ({ tone: "latch" }))] },
      Stop: { actions: [O.ring.cancel] },
      Rang: {},
      NotRung: {},
      Unsure: {},
    },
  }));

  return app({ id: "test", machines: { latch: LatchMachine } });
};

const latched = { machine: "Test/Latch", name: "latch" };

// A persisted write whose failure mapper throws while `jam.on`: a decline's turn is refused at
// every try.
const stuckOver = (jam: { on: boolean }) => {
  const Stuck = definition({
    id: "Test/Stuck",
    persist: true,
    states: ["OPEN"],
    events: { Ring: {} },
    internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
    memory: {},
    operations: ({ E }) => ({
      ring: ring.outcomes({
        success: E.Rang,
        failure: {
          NotSent: E.NotRung.from((e: { readonly why: string }) => {
            if (jam.on)
              // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the case is an author mapper that throws
              throw new Error("the mapper throws");

            return { why: e.why };
          }),
        },
        unknown: E.Unsure,
      }),
    }),
  });

  const StuckMachine = machine(Stuck, ({ S, O }) => ({
    default: S.OPEN,
    on: {
      Ring: { actions: [O.ring.commit(() => ({ tone: "stuck" }))] },
      Rang: {},
      NotRung: {},
      Unsure: {},
    },
  }));

  return { served: app({ id: "test", machines: { stuck: StuckMachine } }), StuckMachine };
};

const stuck = { machine: "Test/Stuck", name: "stuck" };

// A read whose success mapper throws while `jam.on`: its answer's turn is refused at every try.
const peekOver = (jam: { on: boolean }) => {
  const peek = resource({
    id: "Test/peek",
    input: { tone: Schema.String },
    key: ["tone"],
    services: [],
    staleTime: 0,
    gcTime: 0,
    lookup: () => Effect.succeed("seen"),
  });

  const Peek = definition({
    id: "Test/Peek",
    states: ["OPEN"],
    events: { Look: {} },
    internalEvents: { Seen: {}, Unseen: {} },
    memory: {},
    operations: ({ E }) => ({
      peek: peek.outcomes({
        success: E.Seen.from(() => {
          if (jam.on)
            // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the case is an author mapper that throws
            throw new Error("the mapper throws");

          return {};
        }),
        failure: { Defect: E.Unseen },
      }),
    }),
  });

  const PeekMachine = machine(Peek, ({ S, O }) => ({
    default: S.OPEN,
    on: {
      Look: { actions: [O.peek.lookup(() => ({ tone: "peek" }))] },
      Seen: {},
      Unseen: {},
    },
  }));

  return { served: app({ id: "test", machines: { peek: PeekMachine } }), PeekMachine };
};

const peeking = { machine: "Test/Peek", name: "peek" };

// Two persisted writes: an unknown of `first` retries `second`.
const firstRing = transaction({
  id: "Test/first",
  input: { tone: Schema.String },
  key: [],
  concurrency: "reject",
  services: [Bell],
  commit: (_input, { attempt }) =>
    Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(attempt.id)).pipe(
      Effect.catch((e) => Outcome.unknown(e)),
    ),
});

const Pair = definition({
  id: "Test/Pair",
  persist: true,
  states: ["OPEN"],
  events: { Ring: {} },
  internalEvents: {
    Done: {},
    NotDone: { why: Schema.String },
    FirstUnsure: Flow.uncertain({}),
    SecondUnsure: Flow.uncertain({}),
  },
  memory: {},
  operations: ({ E }) => ({
    first: firstRing.outcomes({
      success: E.Done,
      failure: { NotSent: E.NotDone.from((e: { readonly why: string }) => ({ why: e.why })) },
      unknown: E.FirstUnsure,
    }),
    second: ring.outcomes({
      success: E.Done,
      failure: { NotSent: E.NotDone.from((e: { readonly why: string }) => ({ why: e.why })) },
      unknown: E.SecondUnsure,
    }),
  }),
});

const PairMachine = machine(Pair, ({ S, O }) => ({
  default: S.OPEN,
  on: {
    Ring: {
      actions: [O.first.commit(() => ({ tone: "one" })), O.second.commit(() => ({ tone: "two" }))],
    },
    Done: {},
    NotDone: {},
    FirstUnsure: { actions: [O.second.retry] },
    SecondUnsure: {},
  },
}));

const paired = { machine: "Test/Pair", name: "pair" };

const more = app({
  id: "test",
  machines: { jam: JamMachine, pair: PairMachine },
});

const boot = (
  store: Map<string, string>,
  seed: number,
  settled = true,
  served = doors,
  options: { readonly captureMs: number; readonly hung: boolean } = { captureMs: 0, hung: false },
) => bootWith(served, store, seed, settled, options);

describe("write lanes on the production runtime", () => {
  it("a restored Held head retried, then disposed before its re-send, stays Held: it never ends NotSent (WriteLanes I3, model: disposal; Actors R22)", () => {
    const store = new Map<string, string>();
    const first = boot(store, 1);

    testing.attach(first.built, front, "host", false);
    testing.send(first.built, front, "Ring", {});
    first.page.settle();

    const [attempt] = [...first.bell.waiting.keys()];
    assert.ok(attempt !== undefined, "the first boot sent the ring");

    // The page dies with the ring on the wire. The next boot restores its lane Held and delivers
    // unknown Restored, whose handler retries; the Runtime is disposed before the re-send leaves.
    const second = boot(store, 2, false);
    testing.disposeRuntime(second.built);
    second.page.settle();

    assert.deepStrictEqual(endingsOf(second.seen, attempt), ["unknown Restored"]);
    assert.deepStrictEqual(second.bell.rings, [], "nothing is invoked once disposal starts");
    assert.deepStrictEqual(tagsOf(second.seen, attempt, ["Sent"]), []);
  });

  it("dispose() waits for the core's disposal: a call settling inside the bound is parked, then heard by the next incarnation (Actors R22)", async () => {
    const store = new Map<string, string>();
    const first = boot(store, 1);

    testing.attach(first.built, front, "host", false);
    testing.send(first.built, front, "Ring", {});
    first.page.settle();

    const [attempt] = [...first.bell.waiting.keys()];
    assert.ok(attempt !== undefined, "the ring is on the wire");

    const disposing = Effect.runFork(first.built.runtime.dispose());
    first.page.settle();
    assert.strictEqual(disposing.pollUnsafe(), undefined, "dispose() waits for the call");

    first.bell.waiting.get(attempt)?.(Effect.succeed("ding"));
    first.page.settle();

    assert.ok(Exit.isSuccess(await Effect.runPromise(Effect.exit(Fiber.join(disposing)))));
    assert.deepStrictEqual(endingsOf(first.seen, attempt), ["success success"]);
    assert.deepStrictEqual(tagsOf(first.seen, attempt, ["Ended", "Parked", "RuntimeDisposed"]), [
      "Ended",
      "Parked",
      "RuntimeDisposed",
    ]);

    const second = boot(store, 2);
    testing.attach(second.built, front, "host", true);
    second.page.settle();

    assert.deepStrictEqual(
      second.seen.flatMap((e) =>
        e._tag === "Delivered" && Option.contains(e.attempt, attempt) ? [e.event] : [],
      ),
      ["Rang"],
    );
  });

  it("dispose() past the bound: a call that never answers ends unknown Disposed after 5 s, then the disposal ends (Actors R22)", async () => {
    const first = boot(new Map(), 1);

    testing.attach(first.built, front, "host", false);
    testing.send(first.built, front, "Ring", {});
    first.page.settle();

    const [attempt] = [...first.bell.waiting.keys()];
    assert.ok(attempt !== undefined, "the ring is on the wire");

    const disposing = Effect.runFork(first.built.runtime.dispose());
    first.page.advance(4999);
    assert.strictEqual(disposing.pollUnsafe(), undefined, "dispose() waits out the bound");

    first.page.advance(1);

    assert.ok(Exit.isSuccess(await Effect.runPromise(Effect.exit(Fiber.join(disposing)))));
    assert.deepStrictEqual(endingsOf(first.seen, attempt), ["unknown Disposed"]);
    assert.deepStrictEqual(tagsOf(first.seen, attempt, ["Parked", "RuntimeDisposed"]), [
      "Parked",
      "RuntimeDisposed",
    ]);
  });

  it("a key-less retry and retryable on an unkeyed operation, outside an ending's handler, name its one lane (WriteLanes R9)", () => {
    const first = boot(new Map(), 1, true, gates);

    testing.attach(first.built, side, "host", false);
    testing.send(first.built, side, "Ring", {});
    first.page.settle();

    const [attempt] = first.bell.rings;
    assert.ok(attempt !== undefined, "the ring is on the wire");
    first.bell.waiting.get(attempt)?.(Effect.fail("lost"));
    first.page.settle();

    testing.send(first.built, side, "Again", {});
    first.page.settle();

    assert.deepStrictEqual(first.bell.rings, [attempt, attempt], "the Held Attempt is re-sent");
  });

  it("a key-less cancel on an unkeyed operation, outside an ending's handler, releases its one lane (WriteLanes R9, R14)", () => {
    const first = boot(new Map(), 1, true, gates);

    testing.attach(first.built, side, "host", false);
    testing.send(first.built, side, "Ring", {});
    first.page.settle();

    const [attempt] = first.bell.rings;
    assert.ok(attempt !== undefined, "the ring is on the wire");
    first.bell.waiting.get(attempt)?.(Effect.fail("lost"));
    first.page.settle();

    testing.send(first.built, side, "Stop", {});
    testing.send(first.built, side, "Ring", {});
    first.page.settle();

    assert.deepStrictEqual(
      first.seen.flatMap((e) => (e._tag === "Lane" ? [e.kind] : [])),
      ["Released"],
    );
    assert.strictEqual(first.bell.rings.length, 2, "the released lane takes a new commit");
  });
  it("an unknown whose turn is refused twice is kept on its Held lane, not lost (Actors R15, WriteLanes R10)", () => {
    const first = boot(new Map(), 1, true, more);

    testing.attach(first.built, jammed, "host", false);
    testing.send(first.built, jammed, "Ring", {});
    first.page.settle();

    const [attempt] = first.bell.rings;
    assert.ok(attempt !== undefined, "the ring is on the wire");
    first.bell.waiting.get(attempt)?.(Effect.fail("lost"));
    assert.doesNotThrow(() => first.page.settle());

    // The bell's error is untagged, so its reason is Error.
    assert.deepStrictEqual(endingsOf(first.seen, attempt), ["unknown Error"]);
    assert.deepStrictEqual(
      first.seen.flatMap((e) => (e._tag === "Issue" ? [e.code] : [])),
      ["InvalidTurn", "InvalidTurn"],
    );

    // The head stays Held on its lane, blocking its key: a second commit declines Rejected.
    assert.deepStrictEqual(
      [...first.built.driver.world().lanes.values()].map((l) => [l.head.id, l.head.phase._tag]),
      [[attempt, "Held"]],
    );

    testing.send(first.built, jammed, "Ring", {});
    first.page.settle();

    assert.deepStrictEqual(first.bell.rings, [attempt], "nothing new is sent");
    assert.deepStrictEqual(
      first.seen.flatMap((e) =>
        e._tag === "Ended" && Option.isNone(e.attempt) ? [`${e.channel} ${e.reason}`] : [],
      ),
      ["notSent Rejected"],
    );
  });

  it("an ending with no lane whose turn is refused twice is kept for its one try at the next adoption, not lost (Actors R15, I24)", () => {
    const jam = { on: true };
    const { served, StuckMachine } = stuckOver(jam);
    const page = pageOver(new Map(), 1);
    const seen: Array<Evidence> = [];
    const built = testing.build({ app: served, services: bellOf().layer }, page.platform);
    attachInspector(built.runtime, (e) => void seen.push(e));
    Effect.runSync(built.runtime.ready());

    // A persisted identity in a Runtime without persistence: its commit declines NoPersistence
    // before any lane.
    testing.attach(built, stuck, "host", false);
    testing.send(built, stuck, "Ring", {});
    assert.doesNotThrow(() => page.settle());

    // Nothing here has a lane or an Attempt: every delivery and issue is the decline's.
    const declined = (all: ReadonlyArray<Evidence>) =>
      all.flatMap((e) => {
        if (e._tag === "Issue") return [e.code];

        return e._tag === "Delivered" ? [e.event] : [];
      });

    assert.deepStrictEqual(
      seen.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [])),
      ["notSent NoPersistence"],
    );
    assert.deepStrictEqual(declined(seen), ["NotRung", "InvalidTurn", "NotRung", "InvalidTurn"]);

    // The identity is adopted again: the kept decline gets its one more try, and is heard.
    jam.on = false;
    built.runtime.disposeActor(actorRef(StuckMachine, "stuck"));
    testing.attach(built, stuck, "host", false);
    page.settle();

    assert.deepStrictEqual(declined(seen).slice(4), ["NotRung"]);
    assert.ok(
      seen.some((e) => e._tag === "Turn" && e.event === "NotRung"),
      "the kept decline's turn runs",
    );
  });

  it("a read's answer whose turn is refused twice is stranded, not kept for the next adoption (Actors R15)", () => {
    const jam = { on: true };
    const { served, PeekMachine } = peekOver(jam);
    const first = boot(new Map(), 1, true, served);

    testing.attach(first.built, peeking, "host", false);
    testing.send(first.built, peeking, "Look", {});
    assert.doesNotThrow(() => first.page.settle());

    const heard = () =>
      first.seen.flatMap((e) => {
        if (e._tag === "Issue") return [e.code];

        return e._tag === "Delivered" ? [e.event] : [];
      });

    assert.deepStrictEqual(heard(), ["Seen", "InvalidTurn", "Seen", "InvalidTurn"]);

    // The life that asked has ended: its answer is not delivered to the next one.
    jam.on = false;
    first.built.runtime.disposeActor(actorRef(PeekMachine, "peek"));
    testing.attach(first.built, peeking, "host", false);
    first.page.settle();

    assert.deepStrictEqual(heard().slice(4), []);
  });

  it("a call a cancel interrupted ends unknown Cancelled with no value, even when it succeeds (WriteLanes R14, I20)", () => {
    const heard: Array<unknown> = [];
    const first = boot(new Map(), 1, true, latchOver(heard));

    testing.attach(first.built, latched, "host", false);
    testing.send(first.built, latched, "Ring", {});
    first.page.settle();

    const [attempt] = first.bell.rings;
    assert.ok(attempt !== undefined, "the ring is on the wire");
    // The call's success settles after the cancel's interrupt was issued: the host classifies the
    // fiber's exit, and the core hears a success for a Cancelling head.
    testing.send(first.built, latched, "Stop", {});

    const cancelling = [...first.built.driver.world().lanes.values()].flatMap((l) =>
      l.head.phase._tag === "Cancelling" ? [l.head.phase.call] : [],
    );

    assert.strictEqual(cancelling.length, 1, "the cancel interrupted the call");

    for (const call of cancelling)
      first.built.driver.input(
        Input.Settled({ call, result: CallResult.Success({ value: "ding" }) }),
      );
    first.page.settle();

    assert.deepStrictEqual(endingsOf(first.seen, attempt), ["unknown Cancelled"]);
    assert.deepStrictEqual(heard, [undefined]);
  });

  it("a restored unknown admitted after a retry owes its re-send leaves that re-send standing (WriteLanes R8, I26)", () => {
    const store = new Map<string, string>();
    const first = boot(store, 1, true, more);

    testing.attach(first.built, paired, "host", false);
    testing.send(first.built, paired, "Ring", {});
    first.page.settle();

    const [one, two] = first.bell.rings;
    assert.ok(one !== undefined && two !== undefined, "both rings are on the wire");
    first.bell.waiting.get(one)?.(Effect.fail("lost"));
    first.page.settle();
    first.bell.waiting.get(two)?.(Effect.fail("lost"));
    first.page.settle();

    // The identity is disposed and adopted again: both Held heads hear unknown Restored, and the
    // first one's handler retries the second before the second's own Restored is admitted.
    first.built.runtime.disposeActor(actorRef(PairMachine, "pair"));
    testing.attach(first.built, paired, "host", false);
    assert.doesNotThrow(() => first.page.settle());

    assert.deepStrictEqual(
      first.bell.rings.filter((r) => r === two),
      [two, two],
      "the owed re-send is invoked once its capture lands",
    );
  });

  it("dispose() writes what the disposal parked before it closes, with a capture interval pending (Actors R22, R23)", async () => {
    const store = new Map<string, string>();
    const first = boot(store, 1, true, doors, { captureMs: 5000, hung: false });

    testing.attach(first.built, front, "host", false);
    testing.send(first.built, front, "Ring", {});
    first.page.settle();

    const [attempt] = [...first.bell.waiting.keys()];
    assert.ok(attempt !== undefined, "the ring is on the wire");

    const disposing = Effect.runFork(first.built.runtime.dispose());
    first.page.settle();
    first.bell.waiting.get(attempt)?.(Effect.succeed("ding"));
    first.page.settle();

    assert.ok(Exit.isSuccess(await Effect.runPromise(Effect.exit(Fiber.join(disposing)))));

    const second = boot(store, 2);
    testing.attach(second.built, front, "host", true);
    second.page.settle();

    assert.deepStrictEqual(
      second.seen.flatMap((e) =>
        e._tag === "Delivered" && Option.contains(e.attempt, attempt) ? [e.event] : [],
      ),
      ["Rang"],
    );
  });

  it("dispose() bounds its final write by the disposal's 5 s: a silent store reports StorageFailure (Actors R23)", async () => {
    const first = boot(new Map(), 1, true, doors, { captureMs: 0, hung: true });

    testing.attach(first.built, front, "host", false);
    first.page.settle();

    const disposing = Effect.runFork(first.built.runtime.dispose());
    first.page.advance(4999);
    assert.strictEqual(disposing.pollUnsafe(), undefined, "dispose() waits for the write");

    first.page.advance(1);

    assert.ok(Exit.isSuccess(await Effect.runPromise(Effect.exit(Fiber.join(disposing)))));
    assert.ok(first.seen.some((e) => e._tag === "Issue" && e.code === "StorageFailure"));
  });

  it("ready, ensureActor and send after dispose reject RuntimeDisposed (Actors R22)", async () => {
    const first = boot(new Map(), 1);
    const door = first.built.runtime.ensureActor(actorRef(DoorMachine, "front"));

    await Effect.runPromise(first.built.runtime.dispose());

    const disposed = (f: () => unknown) =>
      assert.throws(f, (e) => e instanceof FlowError && e.code === "RuntimeDisposed");

    disposed(() => first.built.runtime.ensureActor(actorRef(DoorMachine, "back")));
    disposed(() => door.send({ _tag: "Ring" }));
    disposed(() => Effect.runSync(first.built.runtime.ready()));
  });

  it("dispose() during the bootstrap cancels it: ready rejects RuntimeDisposed, a service acquired late is released, and no actor starts (Actors R4, R22)", async () => {
    const page = pageOver(new Map(), 1);
    const seen: Array<Evidence> = [];
    const released: Array<string> = [];
    const acquiring: Array<(answer: Effect.Effect<void>) => void> = [];

    const layer = Layer.effect(
      Bell,
      Effect.acquireRelease(
        Effect.callback<void>((resume) => void acquiring.push(resume)).pipe(
          Effect.as(Bell.of({ ring: () => Effect.never })),
        ),
        () => Effect.sync(() => void released.push("bell")),
      ),
    );

    const built = testing.build(
      { app: doors, services: layer, scope: "test", persistence: { captureMs: 0 } },
      page.platform,
    );

    attachInspector(built.runtime, (e) => void seen.push(e));
    const booting = Effect.runFork(built.runtime.ready());
    page.settle();
    assert.strictEqual(acquiring.length, 1, "the bootstrap is acquiring its service");

    await Effect.runPromise(built.runtime.dispose());

    for (const resume of acquiring) resume(Effect.void);
    page.settle();

    const booted = await Effect.runPromise(
      Fiber.join(booting).pipe(
        Effect.match({ onSuccess: () => "booted", onFailure: (e) => e.code }),
      ),
    );

    assert.strictEqual(booted, "RuntimeDisposed");
    assert.deepStrictEqual(released, ["bell"]);
    assert.throws(
      () => built.runtime.ensureActor(actorRef(DoorMachine, "front")),
      (e) => e instanceof FlowError && e.code === "RuntimeDisposed",
    );
    assert.ok(!seen.some((e) => e._tag === "Incarnated"), "no actor starts");
  });
});
