// @effect-diagnostics unstableApiUsage:off -- the setup's adapter runs over Effect's fetch client, as the app's real Layer would
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call -- each line under an `@ts-expect-error` uses a read member or mapper context the Operations Spec adds and the package lacks, so its values type as any until it lands */
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { layerIndexedDb } from "../../../src/host/persistence.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  RuntimeDefaults,
  runtimeSetup,
} from "../../../src/index.ts";
import { SensorsHttp } from "../adapters/sensors.ts";
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
      // @ts-expect-error Operations O2: a placed read maps `value`
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
      // @ts-expect-error Operations O2: a state places a read with `subscribe` in `activities`
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

/**
 * The lounge's thermometer card.
 */
export const loungeCard = actorRef(ThermometerMachine, { room: "lounge" });

/**
 * The home app grown with thermometer cards.
 */
export const homeReadingsApp = app({ id: "home", machines: { cards: ThermometerMachine } });

/**
 * The thermometer cards' real setup: the sensors over HTTP, with a store.
 */
export const homeReadingsSetup = runtimeSetup({
  app: homeReadingsApp,
  services: Layer.merge(
    SensorsHttp("https://sensors.example").pipe(Layer.provide(FetchHttpClient.layer)),
    layerIndexedDb(),
  ),
  scope: "home",
  persistence: { captureMs: 0 },
});
