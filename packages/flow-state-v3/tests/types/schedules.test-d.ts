import { Duration, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { House } from "../../fixtures/home/machines/house.ts";
import { Room } from "../../fixtures/home/machines/room.ts";
import {
  definition,
  Flow,
  type Machine,
  machine,
  type Snapshot,
  type Timers,
} from "../../src/index.ts";

// Inverted: each assertion marked `today` asserts today's wide type and fails once schedules are
// built: make it the narrow type its comment names. Each `@ts-expect-error` marked `inverted` is a
// correct line that fails to compile today; when it compiles, the directive is unused and the check
// fails: delete the directive. The others are two-sided: a refused line beside its correct one.

const Lamp = definition({
  id: "types/schedules/Lamp",
  states: ["OFF", { ON: ["DIM", "BRIGHT"] }],
  events: { Flip: {}, Away: {} },
  internalEvents: { Tick: { attempt: Schema.Number } },
  memory: { level: Flow.initial(Schema.Number, 0) },
  context: { mode: Flow.context(House.state) },
});

describe("schedule functions' inputs (Turn R16, R12; Machines O5)", () => {
  it("Turn R16: a keyed schedule's functions receive its key as the record `keys` returns", () => {
    void machine(Room, ({ S, E }) => ({
      default: S.OFFLINE,
      states: {
        OFFLINE: {
          schedules: {
            poll: {
              keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
              schedule: ({ key }) => {
                // today: the narrow type is { readonly id: string }.
                expectTypeOf(key).toEqualTypeOf<Readonly<Record<string, string>>>();

                return Duration.minutes(1);
              },
              send: E.BoostEnded,
            },
          },
        },
        ONLINE: { default: S.ONLINE.IDLE },
      },
    }));
  });

  it("Turn R12, R27: a pause reason, a guard and an update receive the definition's context, typed by its slots", () => {
    void machine(Lamp, ({ S, E }) => ({
      default: S.OFF,
      on: {
        Flip: [
          {
            guard: [
              (input) => {
                // today: the narrow type has context: { readonly mode?: "HOME" | "AWAY" | "VACATION" }.
                expectTypeOf<
                  "context" extends keyof typeof input ? true : false
                >().toEqualTypeOf<false>();

                return true;
              },
            ],
            updateMemory: (input) => {
              // today: the narrow type has context, as above.
              expectTypeOf<
                "context" extends keyof typeof input ? true : false
              >().toEqualTypeOf<false>();

              return { level: 1 };
            },
          },
        ],
      },
      states: {
        OFF: {
          schedules: {
            tick: {
              schedule: Duration.seconds(1),
              send: E.Tick.from(({ attempt }) => ({ attempt })),
              paused: {
                Away: ({ context }) => {
                  // today: the narrow type is { readonly mode?: "HOME" | "AWAY" | "VACATION" }.
                  // FLOW_STATE_ALLOW_UNKNOWN: today's erased context, the wide type this asserts.
                  expectTypeOf(context).toEqualTypeOf<Readonly<Record<string, unknown>>>();

                  return false;
                },
              },
            },
          },
        },
        ON: { default: S.ON.DIM },
      },
    }));
  });

  it("Compile R14: at depth 2 a schedule's send mapper infers its metadata", () => {
    // Inverted: machine()'s inferred call does not infer a nested leaf's mapper metadata; with the
    // definition given explicitly it does, asserted exactly below.
    void machine(Lamp, ({ S, E }) => ({
      default: S.OFF,
      states: {
        ON: {
          default: S.ON.DIM,
          states: {
            DIM: {
              schedules: {
                tick: {
                  schedule: Duration.seconds(1),
                  // @ts-expect-error inverted, Compile R14: the nested leaf's mapper metadata is not inferred
                  send: E.Tick.from(({ attempt }) => ({ attempt })),
                },
              },
            },
          },
        },
      },
    }));

    expectTypeOf(
      machine<typeof Lamp>(Lamp, ({ S, E }) => ({
        default: S.OFF,
        states: {
          ON: {
            default: S.ON.DIM,
            states: {
              DIM: {
                schedules: {
                  tick: {
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
              tick: {
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
            tick: {
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

  it("Machines O8: a snapshot's schedules are a record by name, a keyed one a keyed list, each `{ dueAt }` or `{ left, pausedBy }` with pausedBy its reasons' names", () => {
    // today: the narrow type is { readonly poll?: ReadonlyArray<{ readonly key: { readonly id: string } }
    // & ({ readonly dueAt: number } | { readonly left: number; readonly pausedBy: ReadonlyArray<"Vacation"
    // | "Saving"> })>; readonly check?: ...; readonly boost?: ... }.
    expectTypeOf<Snapshot<typeof Room>["schedules"]>().toEqualTypeOf<Timers>();
  });
});
