import { Duration } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Room } from "../../fixtures/home/machines/room.ts";
import {
  armedAndDisarmed,
  armOnBesideRestart,
  armOnKeyed,
  keysMissing,
  keysUnexpected,
  misspeltReason,
  reasonMissing,
  restartOnMissing,
  restartOnUndeclared,
  undeclaredSchedule,
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

const Clock = definition({
  id: "Construction/ScheduleClock",
  states: ["ON"],
  events: { Off: {} },
  schedules: { ring: {}, ding: {} },
});

const Bell = definition({
  id: "Construction/ScheduleBell",
  states: ["IDLE"],
  events: { Ring: {} },
});

describe("schedule shapes at construction (Turn R14, R27; Compile T11)", () => {
  it("Turn R14: armOn on a keyed schedule is refused at its armOn", () => {
    expect(refusal(armOnKeyed)).toEqual([
      ["InvalidConfiguration", "states.ONLINE.schedules.poll.armOn"],
    ]);
  });

  it("Turn R14: an event in both armOn and disarmOn is refused at the disarmOn element", () => {
    expect(refusal(armedAndDisarmed)).toEqual([
      ["InvalidConfiguration", "states.ONLINE.schedules.boost.disarmOn.0"],
    ]);
  });

  it("Turn R14: an armOn event beside restartOn is refused at that element; armOn: [Flow.entry] beside it constructs", () => {
    expect(refusal(armOnBesideRestart)).toEqual([
      ["InvalidConfiguration", "states.ONLINE.schedules.check.armOn.1"],
    ]);
  });

  it("Turn R14, Compile T11: another definition's event token in armOn or disarmOn is refused ForeignToken at it", () => {
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
                  boost: { schedule: "1 minute", send: E.BoostEnded, paused: () => true },
                },
              },
            },
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "states.OFFLINE.schedules.boost.paused"]]);
  });

  it("Compile T11: a placement given as null is refused once, at its placement", () => {
    expect(
      refusal(() =>
        machine(Room, ({ S }) =>
          loose({
            default: S.OFFLINE,
            states: {
              ONLINE: { default: S.ONLINE.IDLE },
              OFFLINE: { schedules: { boost: null } },
            },
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "states.OFFLINE.schedules.boost"]]);
  });

  it("Schedules R11: a raw NaN delay is refused at construction, as one past the limit is; a `millis` key is no Duration key and is refused as one; Duration.millis(NaN) is Effect's 0 ms and builds as Duration.millis(0)", () => {
    const placed = (schedule: unknown) =>
      refusal(() =>
        machine(Room, ({ S, E }) =>
          loose({
            default: S.OFFLINE,
            states: {
              ONLINE: { default: S.ONLINE.IDLE },
              OFFLINE: { schedules: { boost: { schedule, send: E.BoostEnded } } },
            },
          }),
        ),
      );

    expect(placed({ millis: Number.NaN })).toEqual([
      ["InvalidConfiguration", "states.OFFLINE.schedules.boost.schedule.millis"],
    ]);
    expect(placed(Number.NaN)).toEqual(placed(2 ** 31));
    expect(placed(2 ** 31)).not.toEqual([]);
    expect(placed(Duration.millis(Number.NaN))).toEqual(placed(Duration.millis(0)));
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
                boost: {
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

// Each refusal as [reason, path].
const reasonsOf = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return error.diagnostics.map((d) => [d.details.reason ?? d.code, d.path.join(".")] as const);
  }

  return [];
};

describe("home's refused shapes of declared schedules: each twin row (Types R8, I13, T8.1)", () => {
  const at = "states.ONLINE.schedules";

  it("Types I13: each refused builder is refused with its own reason, at its placement", () => {
    expect(
      [
        undeclaredSchedule,
        misspeltReason,
        reasonMissing,
        keysMissing,
        keysUnexpected,
        restartOnUndeclared,
        restartOnMissing,
      ].map(reasonsOf),
    ).toEqual([
      [["ScheduleUndeclared", `${at}.nudge`]],
      [["ReasonUndeclared", `${at}.check.paused.Vacaton`]],
      [["ReasonMissing", `${at}.check`]],
      [["KeysMissing", `${at}.poll`]],
      [["KeysUnexpected", `${at}.boost.keys`]],
      [["RestartOnUndeclared", `${at}.boost.restartOn`]],
      [["RestartOnMissing", `${at}.check`]],
    ]);
  });
});
