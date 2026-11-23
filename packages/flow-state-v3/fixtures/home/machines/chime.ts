import { Schedule, Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * A door's chime, named by its door: a press rings it three times at once, each ring a step of an
 * Effect Schedule with no delay; while idle it checks its battery every hour.
 */
export const Chime = definition({
  id: "Home/Chime",
  states: ["IDLE", "RINGING"],
  events: { Press: {} },
  internalEvents: { Ring: {}, Check: {} },
  memory: {
    door: Flow.input(Schema.String),
    rings: Flow.initial(Schema.Number, 0),
    checks: Flow.initial(Schema.Number, 0),
  },
  schedules: { ring: {}, battery: {} },
});

/**
 * The chime: a press starts the rings; each ring and each battery check counts.
 */
export const ChimeMachine = machine(Chime, ({ S, E }) => ({
  default: S.IDLE,
  on: {
    Ring: { updateMemory: ({ memory }) => ({ rings: memory.rings + 1 }) },
    Check: { updateMemory: ({ memory }) => ({ checks: memory.checks + 1 }) },
  },
  states: {
    IDLE: {
      on: { Press: S.RINGING },
      schedules: { battery: { schedule: "1 hour", send: E.Check } },
    },
    RINGING: { schedules: { ring: { schedule: Schedule.recurs(3), send: E.Ring } } },
  },
}));
