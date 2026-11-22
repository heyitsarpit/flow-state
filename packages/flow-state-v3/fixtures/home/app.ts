// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { ThermostatHttp } from "./adapters/thermostat.ts";
import { HouseMachine } from "./machines/house.ts";
import { RoomMachine } from "./machines/room.ts";
import { TripMachine } from "./machines/trip.ts";

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
 * The home app: the house and its rooms, each reading the house's mode, and the trips that put
 * the house on vacation.
 */
export const homeApp = app({
  id: "home",
  machines: {
    house: HouseMachine,
    rooms: { machine: RoomMachine, context: { mode: house } },
    trips: TripMachine,
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
