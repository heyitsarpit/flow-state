import assert from "node:assert/strict";
import { Context, Effect, Layer, Option, Schema } from "effect";
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
  runtimeSetup,
  transaction,
} from "../index.ts";
import { attachInspector, type Evidence } from "./inspect.ts";

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
      failure: { NotSent: E.RingNotSent.from((e: { readonly why: string }) => ({ why: e.why })) },
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

    assert.throws(() => door.send({ _tag: "Name", label: 3 }), flowError("InvalidEvent"));
    assert.throws(() => door.send({ _tag: "Rang" }), flowError("InvalidEvent"));
    assert.deepStrictEqual(stateOf(door), Option.some("SHUT"));
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
      Option.map(door.getSnapshot(), (s) => s.memory["notSent"]),
      Option.some("Unencodable"),
    );
  });

  it("a concurrency policy this build does not run is refused at compile time (stated limit)", () => {
    const latest = transaction({
      id: "Test/latest",
      input: { tone: Schema.String },
      key: [],
      concurrency: "latest",
      services: [],
      commit: () => Effect.void,
    });

    const Bad = definition({
      id: "Test/Bad",
      states: ["A"],
      events: { Go: {} },
      internalEvents: { Done: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({
        go: latest.outcomes({ success: E.Done, failure: {}, unknown: E.Unsure }),
      }),
    });

    assert.throws(() => machine(Bad, ({ S }) => ({ default: S.A })), flowError("InvalidMachine"));
  });
});
