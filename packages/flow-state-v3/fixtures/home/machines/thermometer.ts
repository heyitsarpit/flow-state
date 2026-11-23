import { Schema } from "effect";
import { definition, Flow, machine, RuntimeDefaults } from "../../../src/index.ts";
import { readings } from "../operations/reads.ts";

/**
 * A room's thermometer card, named by room: the temperature as last read, shown while the card is
 * on screen.
 */
export const Thermometer = definition({
  id: "Home/Thermometer",
  states: ["SHOWN", "AWAY"],
  events: { Away: {}, Back: {} },
  internalEvents: { Read: { celsius: Schema.Number }, Unread: {}, Refresh: {}, Returned: {} },
  memory: {
    room: Flow.input(Schema.String),
    celsius: Flow.initial(Schema.Number, 0),
  },
  operations: ({ E }) => ({
    readings: readings.outcomes({
      value: E.Read.from((v) => ({ celsius: v.celsius })),
      failure: { NoResponse: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
  }),
  schedules: { refresh: {}, back: {} },
});

/**
 * Shown, the card places its room's reading and refreshes it every minute; away, it holds nothing
 * and comes back on its own after the Runtime's disposal bound.
 */
export const ThermometerMachine = machine(Thermometer, ({ S, E, O }) => ({
  default: S.SHOWN,
  on: { Read: { updateMemory: ({ event }) => ({ celsius: event.celsius }) } },
  states: {
    SHOWN: {
      activities: [O.readings.subscribe(({ memory }) => ({ room: memory.room }))],
      on: {
        Away: S.AWAY,
        Refresh: { actions: [O.readings.refetch] },
      },
      schedules: { refresh: { schedule: "1 minute", send: E.Refresh, armOn: [Flow.entry] } },
    },
    AWAY: {
      on: { Back: S.SHOWN, Returned: S.SHOWN },
      schedules: {
        back: { schedule: RuntimeDefaults.disposalBound, send: E.Returned, armOn: [Flow.entry] },
      },
    },
  },
}));
