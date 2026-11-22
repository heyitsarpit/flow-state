import { samplesOf } from "../../../src/host/testing/index.ts";
import { house, trip } from "../app.ts";
import { House } from "../machines/house.ts";
import { Room } from "../machines/room.ts";
import { Trip } from "../machines/trip.ts";
import { Thermostat } from "../server/thermostat.ts";
import { homeStory, lounge } from "./usual.ts";

const HOUR = 3_600_000;

/**
 * What a household and the thermostat can do around the lounge, for generated runs: sensors added,
 * changed, removed and returned (none at all among them), targets set while a save is on the wire,
 * retries of an unsure save, boosts, an open window, and vacations ending a millisecond ago, now, at the longest delay and
 * just past it; the thermostat goes offline or loses an answer.
 */
export const samples = samplesOf({
  id: "home-rooms",
  story: homeStory("home-rooms/samples"),
  names: { setup: "homeSetup", fixtures: ["ThermostatFake"] },
  actors: { house, lounge },
  servers: { Thermostat },
  failures: [Thermostat.unplug({ room: "lounge" })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(lounge, Room.E.Connected())
      .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
      .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
      .send(lounge, Room.E.SensorChanged({ id: "t1", kind: "motion" }))
      .send(lounge, Room.E.RemoveSensor({ id: "m1" }))
      .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
      .send(lounge, Room.E.SetTarget({ celsius: 22 }))
      .send(lounge, Room.E.SetTarget({ celsius: 18.5 }))
      .send(lounge, Room.E.SetTarget({ celsius: 25 }))
      .send(lounge, Room.E.RetrySave())
      .send(lounge, Room.E.Boost())
      .send(lounge, Room.E.CancelBoost())
      .send(lounge, Room.E.WindowOpened())
      .send(lounge, Room.E.Reached())
      .send(lounge, Room.E.Disconnected())
      .send(house, House.E.StartVacation({ until: -1 }))
      .send(house, House.E.StartVacation({ until: 0 }))
      .send(house, House.E.StartVacation({ until: 2 ** 31 - 1 }))
      .send(house, House.E.StartVacation({ until: 2 ** 31 }))
      .send(house, House.E.StartVacation({ until: 10 * HOUR }))
      .send(house, House.E.Leave())
      .send(house, House.E.Arrive()),
});

const summer = trip("summer");

/**
 * What a household does with its trips, for generated runs: a trip booked to return a millisecond
 * ago, now, at the longest delay, just past it and in ten hours, each telling the house, which is
 * also left, come home to and sent on vacation by hand.
 */
export const tripSamples = samplesOf({
  id: "home-trips",
  story: homeStory("home-trips/samples"),
  names: { setup: "homeSetup", fixtures: ["ThermostatFake"] },
  actors: { house, summer },
  servers: { Thermostat },
  failures: [],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(summer, Trip.E.Book({ returns: -1 }))
      .send(summer, Trip.E.Book({ returns: 0 }))
      .send(summer, Trip.E.Book({ returns: 2 ** 31 - 1 }))
      .send(summer, Trip.E.Book({ returns: 2 ** 31 }))
      .send(summer, Trip.E.Book({ returns: 10 * HOUR }))
      .send(house, House.E.StartVacation({ until: 2 ** 31 }))
      .send(house, House.E.Leave())
      .send(house, House.E.Arrive()),
});
