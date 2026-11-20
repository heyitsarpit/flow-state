import { describe, expect, it } from "vite-plus/test";
import { Room } from "../../fixtures/home/machines/room.ts";
import {
  armedAndDisarmed,
  armOnBesideRestart,
  armOnKeyed,
} from "../../fixtures/home/stories/structure.ts";
import { definition, FlowError, machine } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";

// Each refusal as [code, path], or none when construction did not refuse.
const refusal = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return error.diagnostics.map((d) => [d.code, d.path.join(".")] as const);
  }

  return [];
};

const Clock = definition({ id: "Construction/ScheduleClock", states: ["ON"], events: { Off: {} } });

const Bell = definition({
  id: "Construction/ScheduleBell",
  states: ["IDLE"],
  events: { Ring: {} },
});

describe("schedule shapes at construction (Turn R14, R27; Compile T11)", () => {
  it.fails("Turn R14: armOn on a keyed schedule is refused at its armOn", () => {
    expect(refusal(armOnKeyed)).toEqual([
      ["InvalidConfiguration", "states.ONLINE.schedules.poll.armOn"],
    ]);
  });

  it.fails("Turn R14: an event in both armOn and disarmOn is refused at the disarmOn element", () => {
    expect(refusal(armedAndDisarmed)).toEqual([
      ["InvalidConfiguration", "states.ONLINE.schedules.boost.disarmOn.0"],
    ]);
  });

  it.fails("Turn R14: an armOn event beside restartOn is refused at that element; armOn: [Flow.entry] beside it constructs", () => {
    expect(refusal(armOnBesideRestart)).toEqual([
      ["InvalidConfiguration", "states.ONLINE.schedules.boost.armOn.1"],
    ]);
  });

  it.fails("Turn R14, Compile T11: another definition's event token in armOn or disarmOn is refused ForeignToken at it", () => {
    expect(
      refusal(() =>
        machine(Clock, ({ S, E }) =>
          loose({
            default: S.ON,
            states: {
              ON: {
                schedules: {
                  ring: { schedule: "1 second", send: E.Off, armOn: [Bell.E.Ring] },
                  ding: { schedule: "1 second", send: E.Off, disarmOn: [Bell.E.Ring] },
                },
              },
            },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "states.ON.schedules.ring.armOn.0"],
      ["InvalidConfiguration", "states.ON.schedules.ding.disarmOn.0"],
    ]);
  });

  it("Turn R27: paused given as a bare function, untyped, is refused WrongKind at paused", () => {
    expect(
      refusal(() =>
        machine(Room, ({ S, E }) =>
          loose({
            default: S.OFFLINE,
            states: {
              ONLINE: { default: S.ONLINE.IDLE },
              OFFLINE: {
                schedules: {
                  nudge: { schedule: "1 minute", send: E.BoostEnded, paused: () => true },
                },
              },
            },
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "states.OFFLINE.schedules.nudge.paused"]]);
  });

  it("Compile T11: a schedule's send mapped from this definition's own event (E.X.from) constructs", () => {
    expect(
      refusal(() =>
        machine(Room, ({ S, E }) => ({
          default: S.OFFLINE,
          states: {
            ONLINE: { default: S.ONLINE.IDLE },
            OFFLINE: {
              schedules: {
                nudge: {
                  schedule: "1 minute",
                  send: E.Polled.from(({ firedAt }) => ({ id: "t1", at: firedAt })),
                },
              },
            },
          },
        })),
      ),
    ).toEqual([]);
  });

  it("Compile T11: a schedule's send mapped from another definition's event is refused ForeignToken at send", () => {
    expect(
      refusal(() =>
        machine(Clock, ({ S }) =>
          loose({
            default: S.ON,
            states: {
              ON: {
                schedules: { ring: { schedule: "1 second", send: Bell.E.Ring.from(() => ({})) } },
              },
            },
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "states.ON.schedules.ring.send"]]);
  });
});
