import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { definition, machine } from "../index.ts";
import { activation } from "./test/ids.ts";
import { LaneView, runTurn, TurnResult } from "./turn.ts";
import { compiledOf } from "../compiled-of.ts";

const Player = definition({
  id: "Turn/Player",
  states: ["IDLE", { ON: ["PLAYING"] }],
  events: {},
  internalEvents: { Saved: {}, Tick: {} },
  schedules: { tick: {} },
});

const compiled = compiledOf(
  machine(Player, ({ S, E }) => ({
    default: S.IDLE,
    states: {
      ON: {
        default: S.ON.PLAYING,
        states: {
          PLAYING: { schedules: { tick: { schedule: 1000, send: E.Tick, armOn: [E.Saved] } } },
        },
      },
    },
  })),
);

const turn = (late: boolean, from: number) =>
  runTurn({
    compiled,
    state: "ON.PLAYING",
    activations: [activation(1), activation(2)],
    history: new Map(),
    memory: {},
    context: {},
    tag: "Saved",
    payload: {},
    late,
    outcome: false,
    from,
    now: 0,
    lane: () => LaneView.Idle(),
    owns: () => false,
    step: () => Option.none(),
  });

describe("armOn's implicit self on a route (Turn R14, R20)", () => {
  it("a current event a PLAYING schedule lists is handled there by the implicit self, restarting the schedule", () => {
    expect(TurnResult.$is("Accepted")(turn(false, 2))).toBe(true);
  });

  it("a late ending routed from the root never reaches PLAYING's implicit self: it is Unhandled", () => {
    expect(turn(true, 0)).toEqual(TurnResult.Unhandled());
  });
});
