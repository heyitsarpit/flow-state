// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { SensorsHttp } from "./adapters/sensors.ts";
import { ThermostatHttp } from "./adapters/thermostat.ts";
import { HouseMachine } from "./machines/house.ts";
import { RoomMachine } from "./machines/room.ts";
import { TripMachine } from "./machines/trip.ts";
import { ChimeMachine } from "./machines/chime.ts";
import { ThermometerMachine } from "./machines/thermometer.ts";

/**
 * The house.
 */
export const house = actorRef(HouseMachine, "home");

/**
 * A room, named by its name.
 */
export const room = (name: string) => actorRef(RoomMachine, { room: name });

/**
 * The `n`th of many rooms.
 */
export const roomOf = (n: number) => room(`room-${String(n)}`);

/**
 * The hall, whose hub pings its paired devices.
 */
export const hall = room("hall");

/**
 * A planned trip, named by its name.
 */
export const trip = (name: string) => actorRef(TripMachine, { name });

/**
 * A door's chime, named by its door.
 */
export const chime = (door: string) => actorRef(ChimeMachine, { door });

/**
 * The lounge's thermometer card.
 */
export const loungeCard = actorRef(ThermometerMachine, { room: "lounge" });

/**
 * The home app: the house and its rooms, each reading the house's mode, the trips that put the
 * house on vacation, and the doors' chimes.
 */
export const homeApp = app({
  id: "home",
  machines: {
    house: HouseMachine,
    rooms: { machine: RoomMachine, context: { mode: house } },
    trips: TripMachine,
    chimes: ChimeMachine,
  },
});

/**
 * The home app grown with thermometer cards: every machine of the fixture, under the id the older
 * setups' apps use.
 */
export const homeGrownApp = app({
  id: "home",
  machines: {
    house: HouseMachine,
    rooms: { machine: RoomMachine, context: { mode: house } },
    trips: TripMachine,
    chimes: ChimeMachine,
    cards: ThermometerMachine,
  },
});

/**
 * The home app's real setup: the thermostats over HTTP, persisted, each capture written at once.
 */
export const homeSetup = runtimeSetup({
  app: homeApp,
  services: Layer.mergeAll(
    ThermostatHttp("https://thermostat.example").pipe(Layer.provide(FetchHttpClient.layer)),
    layerIndexedDb(),
  ),
  scope: "home",
  persistence: { captureMs: 0 },
});

/**
 * The home app with only the thermometer cards, for the readings Stories.
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
