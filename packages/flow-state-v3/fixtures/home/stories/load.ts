import { Fake } from "../../../src/host/testing/index.ts";
import { roomOf, house } from "../app.ts";
import { House } from "../machines/house.ts";
import { Room } from "../machines/room.ts";
import { Thermostat } from "../server/thermostat.ts";
import { homeStory, lounge } from "./usual.ts";

/**
 * How many rooms the load Story opens: a first guess, to be set from the bench.
 */
export const ROOMS = 64;

const HOUR = 3_600_000;

const rooms = Array.from({ length: ROOMS }, (_, n) => roomOf(n));

const manyRoomsHeld = rooms
  .reduce((story, ref, n) => {
    const online = ["a", "b", "c", "d"].reduce(
      (s, id, i) =>
        s.send(ref, Room.E.AddSensor({ id, kind: i % 2 === 0 ? "temperature" : "motion" })),
      story.ensure(ref).send(ref, Room.E.Connected()),
    );

    return n % 2 === 0 ? online.send(ref, Room.E.SetTarget({ celsius: 21 })) : online;
  }, homeStory("home/stress-many-rooms").ensure(house))
  .advance("2 minutes")
  .checkpoint("polling")
  .send(house, House.E.StartVacation({ until: 10 * HOUR }))
  .checkpoint("all held")
  .reload()
  .ensure(house);

/**
 * L1: 64 rooms, each with four sensors (two of each kind) polling; every other room heats; the
 * house goes on vacation for ten minutes and comes home, so every poll and check is held and
 * resumed together, and the tab reloads mid-pause (L4), every room opened again.
 */
export const manyRooms = rooms
  .reduce((story, ref) => story.ensure(ref), manyRoomsHeld)
  .checkpoint("reloaded held")
  .send(house, House.E.Arrive())
  .advance("6 minutes")
  .checkpoint("resumed");

/**
 * The stress run the generator prints from the home samples with seed 36.
 */
export const seededStress = homeStory("home-rooms/stress-36")
  .world(Thermostat.unplug({ room: "lounge" }))
  .ensure(house)
  .world(Fake.storage.hold())
  .ensure(lounge)
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(lounge, Room.E.Boost())
  .send(house, House.E.StartVacation({ until: 2147483648 }))
  .send(lounge, Room.E.Connected())
  .send(lounge, Room.E.SensorChanged({ id: "t1", kind: "motion" }))
  .send(lounge, Room.E.Boost())
  .send(lounge, Room.E.Boost())
  .send(house, House.E.Arrive())
  .reload({ reattach: false })
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(lounge, Room.E.CancelBoost())
  .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
  .send(house, House.E.StartVacation({ until: 36000000 }))
  .send(house, House.E.StartVacation({ until: 0 }))
  .world(Fake.storage.hold())
  .send(lounge, Room.E.Boost())
  .send(lounge, Room.E.Reached())
  .send(lounge, Room.E.Disconnected())
  .world(Fake.network.offline())
  .send(lounge, Room.E.CancelBoost())
  .dispose(house, { how: "forget" })
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .send(house, House.E.StartVacation({ until: -1 }))
  .advance("20 millis")
  .disposeRuntime()
  .reload({ heldWrites: "land" })
  .advance("7 millis")
  .send(lounge, Room.E.SensorChanged({ id: "t1", kind: "motion" }))
  .advance("20 millis")
  .send(house, House.E.StartVacation({ until: 36000000 }))
  .advance("3 millis")
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .advance("16 millis")
  .send(lounge, Room.E.Boost())
  .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
  .send(lounge, Room.E.Boost())
  .send(lounge, Room.E.Disconnected())
  .send(house, House.E.StartVacation({ until: -1 }))
  .send(house, House.E.StartVacation({ until: 2147483648 }))
  .send(house, House.E.StartVacation({ until: 2147483648 }))
  .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
  .send(lounge, Room.E.Boost())
  .advance("5 millis")
  .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
  .advance("2 millis")
  .send(house, House.E.StartVacation({ until: 2147483647 }))
  .advance("17 millis")
  .send(lounge, Room.E.WindowOpened())
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(lounge, Room.E.WindowOpened())
  .advance("18 millis")
  .send(lounge, Room.E.RetrySave())
  .send(lounge, Room.E.SensorChanged({ id: "t1", kind: "motion" }))
  .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
  .send(lounge, Room.E.SetTarget({ celsius: 18.5 }))
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(house, House.E.StartVacation({ until: 2147483648 }))
  .world(Fake.storage.refuseLoad())
  .reload({ reattach: false })
  .advance("4 millis")
  .send(lounge, Room.E.Disconnected())
  .advance("10 millis")
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(house, House.E.StartVacation({ until: 2147483648 }))
  .send(house, House.E.StartVacation({ until: 2147483647 }))
  .send(lounge, Room.E.Reached())
  .send(lounge, Room.E.Boost())
  .send(lounge, Room.E.RetrySave())
  .send(lounge, Room.E.RetrySave())
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(house, House.E.StartVacation({ until: 2147483648 }))
  .send(lounge, Room.E.SetTarget({ celsius: 18.5 }))
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(house, House.E.StartVacation({ until: 36000000 }))
  .advance("20 millis")
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .send(lounge, Room.E.Reached())
  .send(lounge, Room.E.Boost())
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .advance("15 millis")
  .send(lounge, Room.E.Connected())
  .send(house, House.E.Arrive())
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .advance("8 millis")
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .send(lounge, Room.E.RetrySave())
  .advance("7 millis")
  .send(lounge, Room.E.SensorChanged({ id: "t1", kind: "motion" }))
  .send(lounge, Room.E.SetTarget({ celsius: 25 }))
  .send(lounge, Room.E.RemoveSensor({ id: "m1" }))
  .advance("15 millis")
  .send(house, House.E.StartVacation({ until: 2147483647 }))
  .advance("15 millis")
  .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .advance("2 minutes");
