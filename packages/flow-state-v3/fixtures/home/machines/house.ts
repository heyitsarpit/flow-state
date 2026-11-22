import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * The house: home, away, or on vacation until a time the owner set, in Runtime Clock milliseconds.
 */
export const House = definition({
  id: "Home/House",
  persist: true,
  states: ["HOME", "AWAY", "VACATION"],
  events: { Leave: {}, Arrive: {}, StartVacation: { until: Schema.Number } },
  internalEvents: { Returned: {} },
  memory: { until: Flow.initial(Schema.Number, 0) },
  schedules: { homecoming: {} },
});

/**
 * The house's mode: leaving makes it away, a vacation lasts until its end time, and arriving or
 * the end of a vacation brings it home.
 */
export const HouseMachine = machine(House, ({ S, E }) => ({
  default: S.HOME,
  on: {
    Leave: S.AWAY,
    Arrive: { target: S.HOME, updateMemory: () => ({ until: 0 }) },
    StartVacation: { target: S.VACATION, updateMemory: ({ event }) => ({ until: event.until }) },
  },
  states: {
    VACATION: {
      on: { Returned: { target: S.HOME, updateMemory: () => ({ until: 0 }) } },
      schedules: {
        homecoming: { schedule: ({ memory, now }) => memory.until - now, send: E.Returned },
      },
    },
  },
}));
