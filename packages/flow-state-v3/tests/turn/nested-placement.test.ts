import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { played } from "../rules/played.ts";

// One declared schedule placed in a compound and in its child: both states are active at once, and
// each placement is its own activation's timer (Schedules R8, R13). Today the runtime keeps one
// timer per name, so the inner placement's timer replaces the outer one's; the timers by
// activation are @task.V3.T118's.
const Nest = definition({
  id: "Nested/Lamp",
  states: [{ ON: ["A"] }],
  events: {},
  internalEvents: { Outer: {}, Inner: {} },
  memory: { outer: Flow.initial(Schema.Number, 0), inner: Flow.initial(Schema.Number, 0) },
  schedules: { tick: {} },
});

const NestMachine = machine(Nest, ({ S, E }) => ({
  default: S.ON,
  on: {
    Outer: { updateMemory: ({ memory }) => ({ outer: memory.outer + 1 }) },
    Inner: { updateMemory: ({ memory }) => ({ inner: memory.inner + 1 }) },
  },
  states: {
    ON: {
      default: S.ON.A,
      schedules: { tick: { schedule: "1 second", send: E.Outer } },
      states: { A: { schedules: { tick: { schedule: "2 seconds", send: E.Inner } } } },
    },
  },
}));

const nest = actorRef(NestMachine, "nest");

describe("one schedule placed in a state and its child (Schedules R8, R13)", () => {
  it.fails("Schedules R8: a schedule placed in a compound and in its child is two independent timers, one per activation, and both fire", async () => {
    const run = await played(
      Story.app(runtimeSetup({ app: app({ id: "nested", machines: { nest: NestMachine } }) }), {
        id: "nested/two-placements",
        fixtures: [],
      })
        .ensure(nest)
        .advance("3 seconds")
        .checkpoint("fired"),
    );

    expect(run.checkpoints.fired.read(nest)?.memory).toEqual({ outer: 1, inner: 1 });
  });
});
