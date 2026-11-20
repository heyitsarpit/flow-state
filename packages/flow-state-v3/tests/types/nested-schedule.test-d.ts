import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, Flow, machine, type Machine } from "../../src/index.ts";

const Player = definition({
  id: "types/NestedSchedule",
  states: ["OFF", { ON: ["PLAYING", "PAUSED"] }],
  events: { Seek: {}, Tick: {} },
});

describe("Compile R14: a nested leaf's schedule", () => {
  it("a nested leaf's delay and armOn keep their literals in an inferred call, beside their refused misspellings", () => {
    expectTypeOf(
      machine(Player, ({ S, E }) => ({
        default: S.OFF,
        states: {
          ON: {
            default: S.ON.PLAYING,
            states: {
              PLAYING: {
                schedules: {
                  tick: { schedule: "1 second", send: E.Tick, armOn: [Flow.entry, E.Seek] },
                },
              },
            },
          },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Player>>();

    void machine(Player, ({ S, E }) => ({
      default: S.OFF,
      states: {
        ON: {
          default: S.ON.PLAYING,
          states: {
            PLAYING: {
              schedules: {
                // @ts-expect-error Compile R14: "1 secnd" is no Duration
                tick: { schedule: "1 secnd", send: E.Tick, armOn: [Flow.entry, E.Seek] },
              },
            },
          },
        },
      },
    }));

    void machine(Player, ({ S, E }) => ({
      default: S.OFF,
      states: {
        ON: {
          default: S.ON.PLAYING,
          states: {
            PLAYING: {
              schedules: {
                // @ts-expect-error Compile R14: armOn lists event tokens and Flow.entry, never names
                tick: { schedule: "1 second", send: E.Tick, armOn: [Flow.entry, "Seek"] },
              },
            },
          },
        },
      },
    }));
  });
});
