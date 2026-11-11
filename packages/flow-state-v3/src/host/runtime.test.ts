import assert from "node:assert/strict";
import { Context, Effect, Option, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import { definition, deny, Flow, FlowError, machine } from "../index.ts";
import { attachInspector } from "../inspect.ts";
import { Host, testing } from "./testing.ts";

const Door = definition({
  id: "Test/Door",
  states: ["SHUT", "OPEN", "GONE"],
  events: { Push: {}, Name: { label: Schema.String } },
  memory: { label: Flow.initial(Schema.String, "") },
});

const DoorMachine = machine(Door, ({ S }) => ({
  default: S.SHUT,
  on: {
    Name: { updateMemory: ({ event }) => ({ label: event.label }) },
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

const platform = Context.make(
  Host,
  Host.of({
    later: (task) => task(),
    hidden: () => false,
    onHidden: () => undefined,
    store: Option.none(),
    sessionSeed: 7,
  }),
);

const door = { machine: "Test/Door", name: "front" };

const boot = () => {
  const runtime = testing.constructOn(
    { app: { id: "test", machines: { door: DoorMachine } } },
    platform,
  );

  Effect.runSync(runtime.ready());
  testing.attach(runtime, door, "host", false);

  return runtime;
};

const stateOf = (runtime: ReturnType<typeof boot>) =>
  Option.map(testing.snapshot(runtime, door), (s) => s.state);

describe("Runtime driver", () => {
  it("a throwing inspector detaches itself, and later inputs still run (Inspection O3)", () => {
    const runtime = boot();
    let calls = 0;

    attachInspector(runtime, () => {
      calls += 1;

      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the test's own failing sink
      throw new Error("sink failed");
    });

    testing.send(runtime, door, "Push", {});
    testing.send(runtime, door, "Push", {});

    assert.deepStrictEqual(stateOf(runtime), Option.some("GONE"));
    assert.strictEqual(calls, 1);
  });

  it("an event that is not public, or whose payload is invalid, throws InvalidEvent (Actors R14)", () => {
    const runtime = boot();

    const invalidEvent = (e: Error) => e instanceof FlowError && e.code === "InvalidEvent";

    assert.throws(() => testing.send(runtime, door, "Name", { label: 3 }), invalidEvent);
    assert.throws(() => testing.send(runtime, door, "Knock", {}), invalidEvent);
    assert.deepStrictEqual(stateOf(runtime), Option.some("SHUT"));
  });
});
