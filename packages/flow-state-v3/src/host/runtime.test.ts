import assert from "node:assert/strict";
import { Cause, Context, Effect, Exit, Fiber, Layer, Option, Predicate, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import {
  actorRef,
  app,
  definition,
  deny,
  Flow,
  FlowError,
  machine,
  Outcome,
  RuntimeDefaults,
  runtimeSetup,
  send,
  transaction,
} from "../index.ts";
import { Host } from "./host.ts";
import { Store } from "./store.ts";
import { attachInspector, type Evidence, inspect } from "./inspect.ts";
import { buildRuntime } from "./runtime.ts";
import { snapshotIn } from "./snapshot.ts";
import { bootWith } from "./testing/seam.ts";
import { Life } from "../core/life.ts";
import { emptyWorld, Quarantine } from "../core/world.ts";
import { loose } from "../test/loose.ts";
import { compiledOf } from "../compiled-of.ts";

class Bell extends Context.Service<
  Bell,
  { readonly ring: (tone: string) => Effect.Effect<string> }
>()("flow-state-v3/src/host/runtime.test/Bell") {}

const ring = transaction({
  id: "Test/ring",
  input: { tone: Schema.String.check(Schema.isNonEmpty()) },
  key: [],
  concurrency: "reject",
  services: [Bell],
  commit: (input) =>
    Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(input.tone)).pipe(
      Effect.catch((e) => Outcome.unknown(e)),
    ),
});

const Door = definition({
  id: "Test/Door",
  states: ["SHUT", "OPEN", "GONE"],
  events: { Push: {}, Name: { label: Schema.String }, Ring: { tone: Schema.String } },
  internalEvents: { Rang: {}, RingNotSent: { why: Schema.String }, RingUnsure: Flow.uncertain({}) },
  memory: { label: Flow.initial(Schema.String, ""), notSent: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    ring: ring.outcomes({
      success: E.Rang,
      failure: {},
      notSent: E.RingNotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.RingUnsure,
    }),
  }),
});

const DoorMachine = machine(Door, ({ S, O }) => ({
  default: S.SHUT,
  on: {
    Name: { updateMemory: ({ event }) => ({ label: event.label }) },
    Ring: {
      actions: [
        O.ring.commit(({ event }: { readonly event: { readonly tone: string } }) => ({
          tone: event.tone,
        })),
      ],
    },
    Rang: {},
    RingUnsure: {},
    RingNotSent: { updateMemory: ({ event }) => ({ notSent: event.why }) },
  },
  states: {
    SHUT: { on: { Push: { target: S.OPEN } } },
    OPEN: {
      on: {
        Push: [
          { guard: [({ memory }) => memory.label !== "stuck" || deny("Stuck")], target: S.GONE },
        ],
      },
    },
  },
}));

const bellFor = (rings: Array<string>) =>
  Layer.succeed(Bell, Bell.of({ ring: (tone) => Effect.sync(() => (rings.push(tone), tone)) }));

const bell = bellFor([]);

const doors = app({ id: "test", machines: { door: DoorMachine } });

const front = actorRef(DoorMachine, "front");

const ready = (services: Layer.Layer<Bell> = bell) => {
  const runtime = runtimeSetup({ app: doors, services }).construct();
  Effect.runSync(runtime.ready());

  return runtime;
};

const stateOf = (handle: {
  readonly getSnapshot: () => Option.Option<{ readonly state: string }>;
}) => Option.map(handle.getSnapshot(), (s) => s.state);

const flowError = (code: string) => (e: Error) => e instanceof FlowError && e.code === code;

describe("Runtime", () => {
  it("a throwing inspector detaches itself, and later inputs still run (Inspection O3)", () => {
    const runtime = ready();
    let calls = 0;

    attachInspector(runtime, () => {
      calls += 1;

      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the test's own failing sink
      throw new Error("sink failed");
    });

    const door = runtime.ensureActor(front);
    door.send(Door.E.Push({}));
    door.send(Door.E.Push({}));

    assert.deepStrictEqual(stateOf(door), Option.some("GONE"));
    assert.strictEqual(calls, 1);
  });

  it("an event that is not public, or whose payload is invalid, throws InvalidEvent (Actors R14)", () => {
    const door = ready().ensureActor(front);

    // @ts-expect-error -- a caller without types may send a payload its Schema refuses
    assert.throws(() => door.send({ _tag: "Name", label: 3 }), flowError("InvalidEvent"));
    // @ts-expect-error -- a caller without types may send an internal event
    assert.throws(() => door.send({ _tag: "Rang" }), flowError("InvalidEvent"));
    assert.deepStrictEqual(stateOf(door), Option.some("SHUT"));
  });

  it("send accepts the envelope E.X built: a transforming field is checked by its Type side, as E.X checks it, and the handler holds the Date (Actors R14, Compile R14)", () => {
    const Clock = definition({
      id: "Test/Clock",
      states: ["IDLE", "SET"],
      events: { At: { at: Schema.DateFromString } },
      memory: { at: Flow.initial(Schema.NullOr(Schema.DateFromString), null) },
    });

    const clock = machine(Clock, ({ S }) => ({
      default: S.IDLE,
      on: { At: { target: S.SET, updateMemory: ({ event }) => ({ at: event.at }) } },
    }));

    const runtime = runtimeSetup({ app: app({ id: "clock", machines: { clock } }) }).construct();
    Effect.runSync(runtime.ready());
    const actor = runtime.ensureActor(actorRef(clock, "c"));
    const at = Schema.decodeSync(Schema.DateFromString)("1970-01-01T00:00:00Z");

    actor.send(Clock.E.At({ at }));

    assert.deepStrictEqual(stateOf(actor), Option.some("SET"));
    assert.deepStrictEqual(
      Option.map(actor.getSnapshot(), (s) => s.memory.at),
      Option.some(at),
    );
  });

  it("Actors R14: send hands the handler the payload its Schema decodes, keys the Schema does not declare dropped", () => {
    let seen: unknown = undefined;

    const Box = definition({
      id: "Test/Box",
      states: ["EMPTY", "FULL"],
      events: { Put: { n: Schema.Number } },
    });

    const box = machine(Box, ({ S }) => ({
      default: S.EMPTY,
      on: {
        Put: {
          target: S.FULL,
          updateMemory: ({ event }) => {
            seen = event;

            return {};
          },
        },
      },
    }));

    const runtime = runtimeSetup({ app: app({ id: "box", machines: { box } }) }).construct();
    Effect.runSync(runtime.ready());
    const actor = runtime.ensureActor(actorRef(box, "b"));

    // @ts-expect-error -- a caller without types may send keys the payload Schema does not declare
    actor.send({ _tag: "Put", n: 1, extra: "x" });

    assert.deepStrictEqual(seen, { n: 1 });
  });

  it("Actors R14: a send of null, undefined, a number or an envelope without a tag throws InvalidEvent and starts no turn", () => {
    const door = ready().ensureActor(front);

    for (const event of [null, undefined, 5, "Push", {}])
      assert.throws(
        () => door.send(loose(event)),
        (error) => error instanceof FlowError && error.code === "InvalidEvent",
      );
    assert.deepStrictEqual(stateOf(door), Option.some("SHUT"));
  });

  it("Turn R14: a computed delay of NaN refuses the turn that would arm it: the actor stays where it was", () => {
    const Kettle = definition({
      id: "Test/Kettle",
      states: ["COLD", "HEATING", "BOILED"],
      events: { Heat: {} },
      internalEvents: { Boiled: {} },
      schedules: { boil: {} },
    });

    const kettle = machine(Kettle, ({ S, E }) => ({
      default: S.COLD,
      on: { Heat: S.HEATING },
      states: {
        HEATING: {
          on: { Boiled: S.BOILED },
          schedules: { boil: { schedule: () => Number.NaN, send: E.Boiled } },
        },
      },
    }));

    const runtime = runtimeSetup({ app: app({ id: "kettle", machines: { kettle } }) }).construct();
    Effect.runSync(runtime.ready());
    const actor = runtime.ensureActor(actorRef(kettle, "k"));

    actor.send(Kettle.E.Heat());

    assert.deepStrictEqual(stateOf(actor), Option.some("COLD"));
  });

  it("a services Layer that fails to build rejects ready() with Defect, a code of the closed list (Diagnostics R6, I5)", () => {
    const runtime = runtimeSetup({
      app: doors,
      services: Layer.effect(Bell, Effect.fail("no bell")),
    }).construct();

    const exit = Effect.runSyncExit(runtime.ready());

    assert.ok(Exit.isFailure(exit));
    assert.deepStrictEqual(
      Option.map(Exit.findErrorOption(exit), (e) => (e instanceof FlowError ? e.code : "")),
      Option.some("Defect"),
    );
  });

  it("dispose() runs the Runtime's disposal before it closes (Actors R22)", () => {
    const runtime = ready();
    const seen: Array<Evidence["_tag"]> = [];

    attachInspector(runtime, (e) => void seen.push(e._tag));
    Effect.runSync(runtime.dispose());

    assert.ok(seen.includes("RuntimeDisposed"));
  });

  it("ensureActor before ready() rejects RuntimeNotReady and leaves nothing (Actors R4, I5)", () => {
    const runtime = runtimeSetup({ app: doors, services: bell }).construct();

    assert.throws(() => runtime.ensureActor(front), flowError("RuntimeNotReady"));
    Effect.runSync(runtime.ready());
    assert.deepStrictEqual(stateOf(runtime.ensureActor(front)), Option.some("SHUT"));
  });

  it("ready() runs the bootstrap once; every caller shares it (Actors R2, I2, I3)", () => {
    let built = 0;

    const counted = Layer.effect(
      Bell,
      Effect.sync(() => ((built += 1), Bell.of({ ring: Effect.succeed }))),
    );

    const runtime = runtimeSetup({ app: doors, services: counted }).construct();

    Effect.runSync(runtime.ready());
    Effect.runSync(runtime.ready());

    assert.strictEqual(built, 1);
  });

  it("a commit whose input cannot encode declines Unencodable and is never sent (WriteLanes R12)", () => {
    const rings: Array<string> = [];
    const door = ready(bellFor(rings)).ensureActor(front);

    door.send(Door.E.Ring({ tone: "" }));

    assert.deepStrictEqual(rings, []);
    assert.deepStrictEqual(
      Option.map(door.getSnapshot(), (s) => s.memory.notSent),
      Option.some("Unencodable"),
    );
  });
});

describe("the Runtime's host listeners (Actors R22)", () => {
  it("Actors R22: a disposed Runtime leaves no listener on its host's page", () => {
    const listeners = new Set<() => void>();

    const platform = Context.make(
      Host,
      Host.of({
        hidden: () => false,
        onHidden: (listener) => {
          listeners.add(listener);

          return () => void listeners.delete(listener);
        },
        sessionSeed: "0".repeat(32),
        freezeValues: true,
        workClock: Option.none(),
        report: () => undefined,
      }),
    );

    const { runtime } = buildRuntime(
      { app: app({ id: "listeners", machines: {} }) },
      platform,
      () => undefined,
      Option.none(),
    );

    Effect.runSync(runtime.ready());
    assert.equal(listeners.size, 1);

    Effect.runSync(runtime.dispose());
    assert.equal(listeners.size, 0);
  });
});

describe("a defect inside a step (Actors R25)", () => {
  it("Actors R25: the first defect stops the Runtime: ready and dispose fail with it, later calls are refused RuntimeDisposed", async () => {
    // Stored records that throw while the boot step reads them: a defect in the middle of a step.
    const broken = new Map([["actor/x", "{}"]]);
    broken[Symbol.iterator] = () => {
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the planted defect this test is about
      throw new Error("the store's records cannot be read");
    };

    const platform = Context.add(
      Context.make(
        Host,
        Host.of({
          hidden: () => false,
          onHidden: () => () => undefined,
          sessionSeed: "0".repeat(32),
          freezeValues: true,
          workClock: Option.none(),
          report: () => undefined,
        }),
      ),
      Store,
      Store.of({ load: Effect.succeed(broken), write: () => Effect.void }),
    );

    const { runtime } = buildRuntime(
      {
        app: app({ id: "broken", machines: { door: DoorMachine } }),
        scope: "broken",
        persistence: {},
        services: Layer.succeed(Bell, { ring: () => Effect.succeed("ding") }),
      },
      platform,
      () => undefined,
      Option.none(),
    );

    const booted = await Effect.runPromiseExit(runtime.ready());
    assert.ok(Exit.isFailure(booted) && Cause.hasDies(booted.cause));
    assert.throws(() => runtime.ensureActor(front), flowError("RuntimeDisposed"));
    assert.equal(inspect(runtime).lifecycle, "Stopped");

    const disposed = await Effect.runPromiseExit(runtime.dispose());
    assert.ok(Exit.isFailure(disposed) && Cause.hasDies(disposed.cause));
  });
});

// A session seed whose next text read throws once, after it is armed: that mint fails inside its
// step, a defect in the middle of a step.
const trappedSeed = () => {
  const trap = { armed: false };
  const seed = new String("0".repeat(32));

  seed.toString = () => {
    if (trap.armed) {
      trap.armed = false;
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the planted defect these tests are about
      throw new Error("the session seed cannot be read");
    }

    return "0".repeat(32);
  };

  // SAFETY: the core reads a seed only as text, through a template literal, which calls toString.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-chained-type-assertions -- a test host plants its defect in the seed's text
  return { seed: seed as unknown as string, arm: () => void (trap.armed = true) };
};

const Tally = definition({
  id: "Test/Tally",
  persist: true,
  states: ["COUNTING"],
  events: { Bump: { by: Schema.Number } },
  memory: { count: Flow.initial(Schema.Number, 0) },
});

const TallyMachine = machine(Tally, ({ S }) => ({
  default: S.COUNTING,
  on: { Bump: { updateMemory: ({ event, memory }) => ({ count: memory.count + event.by }) } },
}));

// A Runtime over one store, which a reload reads back; its writes wait for its disposal.
const tallyOver = (store: Map<string, string>, sessionSeed: string) =>
  buildRuntime(
    {
      app: app({ id: "tally", machines: { tally: TallyMachine } }),
      scope: "tally",
      persistence: { captureMs: 60_000 },
    },
    Context.add(
      Context.make(
        Host,
        Host.of({
          hidden: () => false,
          onHidden: () => () => undefined,
          sessionSeed,
          freezeValues: true,
          workClock: Option.none(),
          report: () => undefined,
        }),
      ),
      Store,
      Store.of({
        load: Effect.sync(() => new Map(store)),
        write: (writes) =>
          Effect.sync(() => {
            for (const w of writes)
              Option.match(w.value, {
                onNone: () => store.delete(w.key),
                onSome: (text) => store.set(w.key, text),
              });
          }),
      }),
    ),
    () => undefined,
    Option.none(),
  ).runtime;

const tally = actorRef(TallyMachine, "t");

const other = actorRef(TallyMachine, "u");

const countIn = (store: Map<string, string>) =>
  Effect.gen(function* () {
    const runtime = tallyOver(store, "0".repeat(32));
    yield* runtime.ready();
    const count = Option.map(runtime.ensureActor(tally).getSnapshot(), (s) => s.memory.count);
    yield* runtime.dispose();

    return count;
  });

describe("a Runtime a defect stopped (Actors R25)", () => {
  it("Actors R25: an actor's snapshot reads stopped", async () => {
    const trapped = trappedSeed();
    const runtime = tallyOver(new Map(), trapped.seed);
    await Effect.runPromise(runtime.ready());
    const counter = runtime.ensureActor(tally);
    trapped.arm();
    runtime.ensureActor(other);

    assert.deepStrictEqual(
      Option.map(counter.getSnapshot(), (s) => s.lifecycle),
      Option.some("stopped"),
    );
    await Effect.runPromiseExit(runtime.dispose());
  });

  it("Actors R25: a later call is refused RuntimeDisposed, and dispose returns the defect", async () => {
    const trapped = trappedSeed();
    const runtime = tallyOver(new Map(), trapped.seed);
    await Effect.runPromise(runtime.ready());
    runtime.ensureActor(tally);
    trapped.arm();
    runtime.ensureActor(other);

    assert.throws(() => runtime.ensureActor(tally), flowError("RuntimeDisposed"));
    const disposed = await Effect.runPromiseExit(runtime.dispose());
    assert.ok(Exit.isFailure(disposed) && Cause.pretty(disposed.cause).includes("cannot be read"));
    // Stopped is final: dispose() runs no disposal over the half-written world.
    assert.equal(inspect(runtime).lifecycle, "Stopped");
  });

  it("Actors R25: disposeActor is refused RuntimeDisposed, and every refusal names the stop, not a dispose", async () => {
    const trapped = trappedSeed();
    const runtime = tallyOver(new Map(), trapped.seed);
    await Effect.runPromise(runtime.ready());
    runtime.ensureActor(tally);
    trapped.arm();
    runtime.ensureActor(other);

    assert.throws(() => runtime.disposeActor(tally), flowError("RuntimeDisposed"));
    assert.throws(
      () => runtime.ensureActor(tally),
      (e: Error) => /stopped/u.test(e.message),
    );
    const again = await Effect.runPromiseExit(runtime.ready());
    assert.ok(
      Exit.isFailure(again) &&
        /ready\(\) after the Runtime stopped/u.test(Cause.pretty(again.cause)),
    );
    await Effect.runPromiseExit(runtime.dispose());
  });

  it("Actors R25: an identity with only a saved record, a quarantined one, or an ended actor reads stopped too", () => {
    const machines = new Map([[compiledOf(TallyMachine).id, compiledOf(TallyMachine)]]);
    const saved = { machine: compiledOf(TallyMachine).id, name: "saved" };
    const garbled = { machine: compiledOf(TallyMachine).id, name: "garbled" };
    const gone = { machine: compiledOf(TallyMachine).id, name: "gone" };

    const world = {
      ...emptyWorld(true),
      life: Life.Stopped(),
      records: new Map([
        [
          `${saved.machine}/${saved.name}`,
          {
            actor: saved,
            state: "COUNTING",
            memory: { count: 1 },
            schedules: [],
            context: new Map(),
            seen: new Map(),
            baselines: [],
            graph: new Map(),
          },
        ],
      ]),
      quarantined: new Map([
        [
          `actor/${garbled.machine}/${garbled.name}`,
          Quarantine.Unreadable({ code: "text", detail: Option.some("not JSON") }),
        ],
      ]),
      ended: new Map([
        [`${gone.machine}/${gone.name}`, { state: "COUNTING", memory: { count: 2 } }],
      ]),
    };

    assert.deepStrictEqual(
      [saved, garbled, gone].map((actor) =>
        Option.map(snapshotIn(world, machines, actor), (s) => s.lifecycle),
      ),
      [Option.some("stopped"), Option.some("stopped"), Option.some("stopped")],
    );
  });

  it("Actors R25: nothing more is written, so a reload restores the last landed state", async () => {
    const store = new Map<string, string>();
    const first = tallyOver(store, "0".repeat(32));
    await Effect.runPromise(first.ready());
    first.ensureActor(tally).send({ _tag: "Bump", by: 1 });
    await Effect.runPromise(first.dispose());

    const trapped = trappedSeed();
    const second = tallyOver(store, trapped.seed);
    await Effect.runPromise(second.ready());
    second.ensureActor(tally).send({ _tag: "Bump", by: 10 });
    trapped.arm();
    second.ensureActor(other);
    await Effect.runPromiseExit(second.dispose());

    assert.deepStrictEqual(await Effect.runPromise(countIn(store)), Option.some(1));
  });
});

// A Tally Runtime whose admit hook and host visibility each throw once armed: the host's own
// callbacks, run outside the core's step.
const trappedHost = () => {
  const trap = { admit: false, hidden: false };

  const { runtime } = buildRuntime(
    {
      app: app({ id: "trapped", machines: { tally: TallyMachine } }),
      scope: "trapped",
      persistence: { captureMs: 60_000 },
    },
    Context.add(
      Context.make(
        Host,
        Host.of({
          hidden: () => {
            // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the planted throw these tests are about
            if (trap.hidden) throw new Error("the host cannot read its visibility");

            return false;
          },
          onHidden: () => () => undefined,
          sessionSeed: "0".repeat(32),
          freezeValues: true,
          workClock: Option.none(),
          report: () => undefined,
        }),
      ),
      Store,
      Store.of({ load: Effect.succeed(new Map()), write: () => Effect.void }),
    ),
    () => {
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the planted throw these tests are about
      if (trap.admit) throw new Error("the admit hook refused the step");
    },
    Option.none(),
  );

  return { runtime, trap };
};

describe("a throw from the admit hook or from a step's work (Actors R25)", () => {
  it("Actors R25: a throw from the admit hook stops the Runtime, its caller gets it back, and dispose fails with it", async () => {
    const { runtime, trap } = trappedHost();
    await Effect.runPromise(runtime.ready());
    const counter = runtime.ensureActor(tally);
    trap.admit = true;

    assert.throws(
      () => counter.send({ _tag: "Bump", by: 1 }),
      (e: Error) =>
        e instanceof FlowError &&
        e.code === "Defect" &&
        Cause.pretty(Cause.die(e.cause)).includes("refused the step"),
    );
    trap.admit = false;
    assert.equal(inspect(runtime).lifecycle, "Stopped");
    assert.throws(() => runtime.ensureActor(tally), flowError("RuntimeDisposed"));
    const disposed = await Effect.runPromiseExit(runtime.dispose());
    assert.ok(
      Exit.isFailure(disposed) && Cause.pretty(disposed.cause).includes("refused the step"),
    );
  });

  it("Actors R25: a throw while a step's commands are performed stops the Runtime, and dispose fails with it", async () => {
    const { runtime, trap } = trappedHost();
    await Effect.runPromise(runtime.ready());
    const counter = runtime.ensureActor(tally);
    trap.hidden = true;

    counter.send({ _tag: "Bump", by: 1 });

    assert.equal(inspect(runtime).lifecycle, "Stopped");
    assert.throws(() => runtime.ensureActor(tally), flowError("RuntimeDisposed"));
    const disposed = await Effect.runPromiseExit(runtime.dispose());
    assert.ok(
      Exit.isFailure(disposed) &&
        Cause.pretty(disposed.cause).includes("cannot read its visibility"),
    );
  });
});

// More bumps than the sending step's drain and the dispose step's drain serve together, so the
// ensure's step finds some still in the mail.
const PAST_DRAIN = 2 * RuntimeDefaults.drainYield + 50;

const Fan = definition({ id: "Test/Fan", states: ["ON"], events: { Burst: {} } });

const FanMachine = machine(Fan, ({ S }) => ({
  default: S.ON,
  on: {
    Burst: {
      actions: Array.from({ length: PAST_DRAIN }, () => send(() => tally, Tally.E.Bump({ by: 1 }))),
    },
  },
}));

const countOf = (handle: {
  readonly getSnapshot: () => Option.Option<{ readonly memory: Readonly<Record<string, unknown>> }>;
}) => Option.map(handle.getSnapshot(), (s) => s.memory.count);

describe("mail at disposeActor (Actors R10, R20)", () => {
  it("Actors R10: events queued past the dispose step's drain never reach the new incarnation an ensure in the same host task starts", () => {
    const { built, tab } = bootWith(
      app({ id: "fan", machines: { tally: TallyMachine, fan: FanMachine } }),
      new Map(),
      1,
    );

    const first = built.runtime.ensureActor(tally);
    built.runtime.ensureActor(actorRef(FanMachine, "f")).send({ _tag: "Burst" });
    const served = countOf(first);
    built.runtime.disposeActor(tally);
    const fresh = built.runtime.ensureActor(tally);
    tab.settle();

    assert.ok(Option.exists(served, (n) => Predicate.isNumber(n) && n < PAST_DRAIN));
    assert.deepStrictEqual(countOf(fresh), Option.some(0));
  });
});

// A FlowError's code, or none for anything else.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a call rejected or failed with.
const codeOf = (e: unknown) => (e instanceof FlowError ? Option.some(e.code) : Option.none());

// The whole Cause a FlowError keeps, printed.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a call rejected or failed with.
const causeOf = (e: unknown) =>
  e instanceof FlowError && Cause.isCause(e.cause) ? Cause.pretty(e.cause) : "";

// The bell's line, which fails to close when the services are released.
const brokenLine = Layer.merge(
  bell,
  Layer.effectDiscard(Effect.addFinalizer(() => Effect.die("the bell's line did not close"))),
);

describe("a cleanup that fails at disposal (Actors R23, I33; Diagnostics R8)", () => {
  it("Actors R23, I33: a services finalizer that fails rejects dispose with CleanupFailed keeping the whole Cause, and a second dispose shares it", async () => {
    const runtime = ready(brokenLine);
    const first = await Effect.runPromiseExit(runtime.dispose());
    const second = await Effect.runPromiseExit(runtime.dispose());

    for (const exit of [first, second]) {
      const error = Exit.isFailure(exit)
        ? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
        : undefined;

      assert.deepStrictEqual(codeOf(error), Option.some("CleanupFailed"));
      assert.ok(causeOf(error).includes("the bell's line did not close"));
    }
  });

  it("Actors R20, R23: a first dispose whose caller is interrupted still closes once, and a later dispose gets the same CleanupFailed", async () => {
    const runtime = ready(brokenLine);
    const abandoned = Effect.runFork(runtime.dispose());
    await Effect.runPromise(Fiber.interrupt(abandoned));
    const later = await Effect.runPromiseExit(runtime.dispose());
    const again = await Effect.runPromiseExit(runtime.dispose());

    for (const exit of [later, again]) {
      const error = Exit.isFailure(exit)
        ? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
        : undefined;

      assert.deepStrictEqual(codeOf(error), Option.some("CleanupFailed"));
      assert.equal(causeOf(error).split("the bell's line did not close").length, 2);
    }
  });
});

// What a promise rejected with.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a promise rejected with.
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => e,
  );

describe("runtime.runPromise (Actors R27, R22; Diagnostics R8)", () => {
  it("Actors R27: runPromise runs an Effect with the app's installed services", async () => {
    const rings: Array<string> = [];
    const runtime = ready(bellFor(rings));

    const rang = await runtime.runPromise(
      Effect.flatMap(Effect.service(Bell), (b) => b.ring("ding")),
    );

    assert.equal(rang, "ding");
    assert.deepStrictEqual(rings, ["ding"]);
  });

  it("Actors R4, R27: runPromise before ready rejects RuntimeNotReady and runs nothing", async () => {
    const rings: Array<string> = [];
    const runtime = runtimeSetup({ app: doors, services: bellFor(rings) }).construct();

    const refused = await rejection(
      runtime.runPromise(Effect.flatMap(Effect.service(Bell), (b) => b.ring("ding"))),
    );

    assert.deepStrictEqual(codeOf(refused), Option.some("RuntimeNotReady"));
    assert.deepStrictEqual(rings, []);
  });

  it("Actors R22, R27: runPromise rejects RuntimeDisposed once disposal has started, and runs nothing", async () => {
    const rings: Array<string> = [];
    const runtime = ready(bellFor(rings));
    await Effect.runPromise(runtime.dispose());

    const refused = await rejection(
      runtime.runPromise(Effect.flatMap(Effect.service(Bell), (b) => b.ring("ding"))),
    );

    assert.deepStrictEqual(codeOf(refused), Option.some("RuntimeDisposed"));
    assert.deepStrictEqual(rings, []);
  });

  it("Actors R27, Diagnostics R8: a failed Effect rejects with a FlowError coded RunFailed that keeps its whole Cause", async () => {
    const runtime = ready();
    const failed = await rejection(runtime.runPromise(Effect.fail("the line is busy")));

    assert.ok(failed instanceof FlowError);
    assert.equal(failed.code, "RunFailed");
    assert.equal(failed.diagnostics[0].classification, "Failure");
    assert.ok(causeOf(failed).includes("the line is busy"));
  });

  it("Actors R27, Diagnostics R8: aborting the signal interrupts the Effect, and the rejection keeps its Interruption Cause", async () => {
    const runtime = ready();
    const abort = new AbortController();
    const hungUp: Array<string> = [];

    const running = rejection(
      runtime.runPromise(
        Effect.onInterrupt(Effect.never, () => Effect.sync(() => void hungUp.push("hung up"))),
        { signal: abort.signal },
      ),
    );

    abort.abort();
    const interrupted = await running;

    assert.ok(interrupted instanceof FlowError);
    assert.equal(interrupted.code, "RunFailed");
    assert.equal(interrupted.diagnostics[0].classification, "Interruption");
    assert.deepStrictEqual(hungUp, ["hung up"]);
  });

  it("Actors R22, R27: an Effect runPromise is running is interrupted by the Runtime's disposal, and rejects RunFailed", async () => {
    const runtime = ready();
    const running = rejection(runtime.runPromise(Effect.never));
    await Effect.runPromise(runtime.dispose());
    const interrupted = await running;

    assert.deepStrictEqual(codeOf(interrupted), Option.some("RunFailed"));
  });
});
