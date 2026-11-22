import { Duration, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { House } from "../../fixtures/home/machines/house.ts";
import { Room } from "../../fixtures/home/machines/room.ts";
import { definition, deny, Flow, type Machine, machine, type Snapshot } from "../../src/index.ts";

// Two-sided: a refused line beside its correct one.

const Lamp = definition({
  id: "types/schedules/Lamp",
  states: ["OFF", { ON: ["DIM", "BRIGHT"] }],
  events: { Flip: {}, Away: {} },
  internalEvents: { Tick: { attempt: Schema.Number } },
  memory: { level: Flow.initial(Schema.Number, 0) },
  context: { mode: Flow.context(House.state) },
  schedules: {
    timed: { pausedBy: ["Away"], restartOn: Schema.Number },
    held: { pausedBy: ["Away"] },
    plain: {},
  },
});

type Mode = Partial<{ readonly mode: "HOME" | "AWAY" | "VACATION" }>;

describe("schedule functions' inputs (Turn R16, R12; Machines O5)", () => {
  it("Types R8: a keyed schedule's schedule, restartOn, pause reasons and send mapper receive its declared key; another field, and keys on an unkeyed schedule, are refused", () => {
    expectTypeOf(
      machine(Room, ({ S, E }) => ({
        default: S.OFFLINE,
        states: {
          OFFLINE: {
            schedules: {
              poll: {
                keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
                schedule: ({ key }) => {
                  expectTypeOf(key).toEqualTypeOf<{ readonly id: string }>();

                  return Duration.minutes(1);
                },
                restartOn: ({ key }) => {
                  expectTypeOf(key).toEqualTypeOf<{ readonly id: string }>();

                  return key.id === "" ? "motion" : "temperature";
                },
                paused: {
                  Vacation: ({ key }) => {
                    expectTypeOf(key).toEqualTypeOf<{ readonly id: string }>();

                    return key.id === "";
                  },
                  Saving: () => false,
                },
                send: E.Polled.from(({ key }) => {
                  expectTypeOf(key).toEqualTypeOf<{ readonly id: string }>();

                  return { id: key.id, at: 0 };
                }),
              },
            },
          },
          ONLINE: { default: S.ONLINE.IDLE },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Room>>();

    void machine(Room, ({ S, E }) => ({
      default: S.OFFLINE,
      states: {
        OFFLINE: {
          schedules: {
            poll: {
              keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
              // @ts-expect-error Types R8: the declared key holds id alone
              schedule: ({ key }) => Duration.minutes(key.kind === "motion" ? 1 : 2),
              send: E.BoostEnded,
              restartOn: () => "motion",
              paused: { Vacation: () => false, Saving: () => false },
            },
            boost: {
              // @ts-expect-error Types R8: boost is declared without a key
              keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
              schedule: Duration.minutes(1),
              send: E.BoostEnded,
            },
          },
        },
        ONLINE: { default: S.ONLINE.IDLE },
      },
    }));
  });

  it("Turn R16: an unkeyed schedule's functions receive `key` as undefined, so reading a field of it is refused", () => {
    expectTypeOf(
      machine(Lamp, ({ S, E }) => ({
        default: S.OFF,
        states: {
          OFF: {
            schedules: {
              timed: {
                schedule: ({ key }) => {
                  expectTypeOf(key).toEqualTypeOf<undefined>();

                  return Duration.seconds(1);
                },
                send: E.Tick.from(({ attempt }) => ({ attempt })),
                restartOn: ({ key }) => {
                  expectTypeOf(key).toEqualTypeOf<undefined>();

                  return 0;
                },
                paused: {
                  Away: ({ key }) => {
                    expectTypeOf(key).toEqualTypeOf<undefined>();

                    return false;
                  },
                },
              },
            },
          },
          ON: { default: S.ON.DIM },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Lamp>>();

    void machine(Lamp, ({ S, E }) => ({
      default: S.OFF,
      states: {
        OFF: {
          schedules: {
            plain: {
              // @ts-expect-error Turn R16: an unkeyed schedule's key is undefined
              schedule: ({ key }) => Duration.seconds(key.id === "" ? 1 : 2),
              send: E.Tick.from(({ attempt }) => ({ attempt })),
            },
          },
        },
        ON: { default: S.ON.DIM },
      },
    }));
  });

  it("Turn R12, R27: a pause reason, a guard and an update receive the definition's context, typed by its slots; a value outside a slot's type is refused", () => {
    expectTypeOf(
      machine(Lamp, ({ S, E }) => ({
        default: S.OFF,
        on: {
          Flip: [
            {
              guard: [
                ({ context }) => {
                  expectTypeOf(context).toEqualTypeOf<Mode>();

                  return true;
                },
              ],
              updateMemory: ({ context }) => {
                expectTypeOf(context).toEqualTypeOf<Mode>();

                return { level: context.mode === "AWAY" ? 0 : 1 };
              },
            },
          ],
        },
        states: {
          OFF: {
            schedules: {
              held: {
                schedule: Duration.seconds(1),
                send: E.Tick.from(({ attempt }) => ({ attempt })),
                paused: {
                  Away: ({ context }) => {
                    expectTypeOf(context).toEqualTypeOf<Mode>();

                    return context.mode === "AWAY";
                  },
                },
              },
            },
          },
          ON: { default: S.ON.DIM },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Lamp>>();

    void machine(Lamp, ({ S, E }) => ({
      default: S.OFF,
      on: {
        Flip: {
          // @ts-expect-error Turn R12: mode is HOME, AWAY or VACATION
          guard: [({ context }) => context.mode === "OUT" || deny("Out")],
        },
      },
      states: {
        OFF: {
          schedules: {
            held: {
              schedule: Duration.seconds(1),
              send: E.Tick.from(({ attempt }) => ({ attempt })),
              // @ts-expect-error Turn R12: the context has no slot named user
              paused: { Away: ({ context }) => context.user === "" },
            },
          },
        },
        ON: { default: S.ON.DIM },
      },
    }));
  });

  it("Compile R14: at depth 2 a schedule's send mapper infers its metadata", () => {
    expectTypeOf(
      machine(Lamp, ({ S, E }) => ({
        default: S.OFF,
        states: {
          ON: {
            default: S.ON.DIM,
            states: {
              DIM: {
                schedules: {
                  plain: {
                    schedule: Duration.seconds(1),
                    send: E.Tick.from(({ attempt }) => ({ attempt })),
                  },
                },
              },
            },
          },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Lamp>>();

    void machine(Lamp, ({ S, E }) => ({
      default: S.OFF,
      states: {
        ON: {
          default: S.ON.DIM,
          states: {
            DIM: {
              schedules: {
                plain: {
                  schedule: Duration.seconds(1),
                  // @ts-expect-error Compile R14: the metadata has attempt, not tries
                  send: E.Tick.from(({ tries }) => ({ attempt: tries })),
                },
              },
            },
          },
        },
      },
    }));
  });
});

describe("paused and the snapshot's timers (Turn R27; Machines O8)", () => {
  it("Turn R27: paused is a record of named reasons; a bare function is refused", () => {
    expectTypeOf(
      machine(Lamp, ({ S, E }) => ({
        default: S.OFF,
        states: {
          OFF: {
            schedules: {
              held: {
                schedule: Duration.seconds(1),
                send: E.Tick.from(({ attempt }) => ({ attempt })),
                paused: { Away: ({ memory }) => memory.level > 0 },
              },
            },
          },
          ON: { default: S.ON.DIM },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Lamp>>();

    void machine(Lamp, ({ S, E }) => ({
      default: S.OFF,
      states: {
        OFF: {
          schedules: {
            held: {
              schedule: Duration.seconds(1),
              send: E.Tick.from(({ attempt }) => ({ attempt })),
              // @ts-expect-error Turn R27: paused is a record of reasons, never a bare function
              paused: () => true,
            },
          },
        },
        ON: { default: S.ON.DIM },
      },
    }));
  });

  it("Machines O8: a snapshot's schedules are a record by declared name, a keyed one a keyed list, each `{ dueAt }` or `{ left, pausedBy }` with pausedBy its declared reasons", () => {
    type Paused<R extends string> = { readonly left: number; readonly pausedBy: ReadonlyArray<R> };

    type Due = { readonly dueAt: number };

    expectTypeOf<Snapshot<typeof Room>["schedules"]>().toEqualTypeOf<
      Partial<{
        readonly reconnect: Due | Paused<never>;
        readonly poll: ReadonlyArray<
          { readonly key: { readonly id: string } } & (Due | Paused<"Vacation" | "Saving">)
        >;
        readonly check: Due | Paused<"Vacation">;
        readonly boost: Due | Paused<never>;
        readonly ping: ReadonlyArray<
          { readonly key: { readonly id: string } } & (Due | Paused<"Away">)
        >;
      }>
    >();
  });
});
