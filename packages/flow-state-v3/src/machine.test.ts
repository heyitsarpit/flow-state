import assert from "node:assert/strict";
import { Effect, Option, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import { actorRef, app, definition, Flow, FlowError, machine, runtimeSetup } from "./index.ts";

const Lamp = definition({
  id: "Test/Lamp",
  states: ["OFF", "ON"],
  events: { Flip: {}, Dim: { level: Schema.Number } },
  memory: { level: Flow.initial(Schema.Number, 0) },
});

const invalid = (e: Error) => e instanceof FlowError && e.code === "InvalidMachine";

describe("machine", () => {
  it("a target no state names is one construction error, with its path (Compile R2, R3)", () => {
    const Wrong = definition({
      id: "Test/Wrong",
      states: ["OFF"],
      events: { Flip: {} },
      memory: {},
    });

    assert.throws(
      () =>
        machine(Wrong, ({ S }) => ({
          default: S.OFF,
          // @ts-expect-error -- a foreign state token is a type error (Compile R14), and refused at run time
          on: { Flip: { target: Lamp.S.ON } },
        })),
      (e: Error) =>
        invalid(e) &&
        e instanceof FlowError &&
        e.problems.some((p) => p.startsWith("on.Flip[0].target")),
    );
  });

  it("builds inert, and runs the handlers it compiled (Compile R1, Turn R2)", () => {
    const LampMachine = machine(Lamp, ({ S }) => ({
      default: S.OFF,
      on: { Dim: { updateMemory: ({ event }) => ({ level: event.level }) } },
      states: { OFF: { on: { Flip: { target: S.ON } } }, ON: { on: { Flip: { target: S.OFF } } } },
    }));

    const runtime = runtimeSetup({
      app: app({ id: "lamps", machines: { lamp: LampMachine } }),
    }).construct();

    Effect.runSync(runtime.ready());
    const lamp = runtime.ensureActor(actorRef(LampMachine, "desk"));

    lamp.send(Lamp.E.Flip({}));
    lamp.send(Lamp.E.Dim({ level: 3 }));

    assert.deepStrictEqual(
      Option.map(lamp.getSnapshot(), (s) => [s.state, s.memory["level"]]),
      Option.some(["ON", 3]),
    );
  });
});
