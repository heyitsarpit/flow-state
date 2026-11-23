import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { refusal } from "../refusals.ts";
import { played } from "../rules/played.ts";

// One declared schedule placed in a state and in a state below it: both are active at once, the
// snapshot shows one timer per unkeyed name, and the two timers' issues could not be told apart,
// so construction refuses the second placement. Placements in sibling states are never active
// together and construct (Schedules R8, R15).
const Nest = definition({
  id: "Nested/Lamp",
  states: [{ ON: ["A", "B"] }],
  events: { Swap: {} },
  internalEvents: { Outer: {}, Inner: {} },
  memory: { outer: Flow.initial(Schema.Number, 0), inner: Flow.initial(Schema.Number, 0) },
  schedules: { tick: {} },
});

// Each refusal as [reason, path], or none when construction did not refuse.
const reasonsOf = (construct: () => unknown) =>
  refusal(construct, (d) => [d.details.reason ?? d.code, d.path.join(".")]);

// The lamp with a grandchild state, for a placement two levels below another.
const Deep = definition({
  id: "Nested/DeepLamp",
  states: [{ ON: [{ A: ["X"] }] }],
  events: {},
  internalEvents: { Outer: {}, Inner: {} },
  schedules: { tick: {} },
});

const SiblingMachine = machine(Nest, ({ S, E }) => ({
  default: S.ON,
  on: {
    Outer: { updateMemory: ({ memory }) => ({ outer: memory.outer + 1 }) },
    Inner: { updateMemory: ({ memory }) => ({ inner: memory.inner + 1 }) },
  },
  states: {
    ON: {
      default: S.ON.A,
      states: {
        A: {
          on: { Swap: S.ON.B },
          schedules: { tick: { schedule: "1 second", send: E.Outer } },
        },
        B: { schedules: { tick: { schedule: "2 seconds", send: E.Inner } } },
      },
    },
  },
}));

describe("one schedule placed in a state and in a state below it (Schedules R8, R15)", () => {
  it("Schedules R8: a schedule placed in a state and again in its child is refused at the child's placement", () => {
    expect(
      reasonsOf(() =>
        machine(Nest, ({ S, E }) =>
          loose({
            default: S.ON,
            states: {
              ON: {
                default: S.ON.A,
                schedules: { tick: { schedule: "1 second", send: E.Outer } },
                states: {
                  A: { schedules: { tick: { schedule: "2 seconds", send: E.Inner } } },
                  B: {},
                },
              },
            },
          }),
        ),
      ),
    ).toEqual([["DuplicateName", "states.ON.states.A.schedules.tick"]]);
  });

  it("Schedules R8: a schedule placed in a state and again two levels below it is refused at the lower placement", () => {
    expect(
      reasonsOf(() =>
        machine(Deep, ({ S, E }) =>
          loose({
            default: S.ON,
            states: {
              ON: {
                default: S.ON.A,
                schedules: { tick: { schedule: "1 second", send: E.Outer } },
                states: {
                  A: {
                    default: S.ON.A.X,
                    states: {
                      X: { schedules: { tick: { schedule: "2 seconds", send: E.Inner } } },
                    },
                  },
                },
              },
            },
          }),
        ),
      ),
    ).toEqual([["DuplicateName", "states.ON.states.A.states.X.schedules.tick"]]);
  });

  it("Schedules R8: a schedule placed in two sibling states constructs, and each fires in its own state", async () => {
    const lamp = actorRef(SiblingMachine, "lamp");

    const run = await played(
      Story.app(runtimeSetup({ app: app({ id: "nested", machines: { lamp: SiblingMachine } }) }), {
        id: "nested/siblings",
        fixtures: [],
      })
        .ensure(lamp)
        .advance("1 second")
        .checkpoint("in A")
        .send(lamp, Nest.E.Swap())
        .advance("2 seconds")
        .checkpoint("in B"),
    );

    expect([
      run.checkpoints["in A"].read(lamp)?.memory,
      run.checkpoints["in B"].read(lamp)?.memory,
    ]).toEqual([
      { outer: 1, inner: 0 },
      { outer: 1, inner: 1 },
    ]);
  });
});
