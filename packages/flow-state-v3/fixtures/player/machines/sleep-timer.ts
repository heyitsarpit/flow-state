import { Duration, Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * A room's sleep timer, named by its room: how long after it is set the music stops, sent as
 * milliseconds and held as a `Duration`, or `null` while it is not set.
 */
export const SleepTimer = definition({
  id: "Music/SleepTimer",
  states: ["IDLE", "ARMED", "ASLEEP"],
  events: { Set: { after: Schema.DurationFromMillis }, Cancel: {} },
  internalEvents: { Fire: {} },
  memory: {
    room: Flow.input(Schema.String),
    after: Flow.initial(Schema.NullOr(Schema.DurationFromMillis), null),
  },
  schedules: { sleep: {} },
});

/**
 * The timer: set, it is armed and falls asleep once its duration has passed; cancelled, it is
 * idle again.
 */
export const SleepTimerMachine = machine(SleepTimer, ({ S, E }) => ({
  default: S.IDLE,
  on: {
    Set: { target: S.ARMED, updateMemory: ({ event }) => ({ after: event.after }) },
    Cancel: { target: S.IDLE, updateMemory: () => ({ after: null }) },
  },
  states: {
    ARMED: {
      on: { Fire: S.ASLEEP },
      schedules: {
        sleep: {
          schedule: ({ memory }) => (memory.after === null ? 0 : Duration.toMillis(memory.after)),
          send: E.Fire,
        },
      },
    },
  },
}));
