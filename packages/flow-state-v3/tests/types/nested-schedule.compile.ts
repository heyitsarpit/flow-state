import { definition, Flow, machine } from "../../src/index.ts";

const Player = definition({
  id: "types/NestedSchedule",
  states: ["OFF", { ON: ["PLAYING", "PAUSED"] }],
  events: { Seek: {}, Tick: {} },
});

// Inverted: Compile R14 (literals infer without assertions or explicit generics) fails today for a
// schedule on a nested leaf: machine()'s inferred call widens its string delay and its armOn
// names. When that is fixed, these directives are unused and the type check fails: delete them.
void machine(Player, ({ S, E }) => ({
  default: S.OFF,
  states: {
    ON: {
      default: S.ON.PLAYING,
      states: {
        PLAYING: {
          schedules: {
            // @ts-expect-error inverted, Compile R14: the nested leaf's literals widen to string
            tick: { schedule: "1 second", send: E.Tick, armOn: [Flow.entry, "Seek"] },
          },
        },
      },
    },
  },
}));

void machine<typeof Player>(Player, ({ S, E }) => ({
  default: S.OFF,
  states: {
    ON: {
      default: S.ON.PLAYING,
      states: {
        PLAYING: {
          schedules: {
            tick: { schedule: "1 second", send: E.Tick, armOn: [Flow.entry, "Seek"] },
          },
        },
      },
    },
  },
}));
