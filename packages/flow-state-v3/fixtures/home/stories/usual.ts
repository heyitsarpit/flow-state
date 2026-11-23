import { Story } from "../../../src/host/testing/index.ts";
import { homeSetup, house, room, trip } from "../app.ts";
import { House } from "../machines/house.ts";
import { Room } from "../machines/room.ts";
import { Trip } from "../machines/trip.ts";
import { ThermostatFake } from "../server/layer.ts";
import { Thermostat } from "../server/thermostat.ts";

/**
 * The home app over its thermostat fake, with no steps yet: every home Story starts here.
 */
export const homeStory = (id: string) => Story.app(homeSetup, { id, fixtures: [ThermostatFake] });

/**
 * The lounge, the room most Stories use.
 */
export const lounge = room("lounge");

const HOUR = 3_600_000;

/**
 * The lounge online with a temperature sensor and a motion sensor.
 */
export const loungeWithSensors = (story: ReturnType<typeof homeStory>) =>
  story
    .ensure(house)
    .ensure(lounge)
    .send(lounge, Room.E.Connected())
    .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
    .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }));

/**
 * The lounge polls its sensors on their own timers; a new target heats the room, holding the polls
 * while the thermostat saves it, and checks the temperature five minutes on; a vacation holds the
 * polls and the checks, an hour passes, and arriving home resumes both from where they were held.
 */
export const usual = loungeWithSensors(homeStory("home/usual"))
  .checkpoint("online")
  .advance("10 seconds")
  .checkpoint("motion polled")
  .advance("50 seconds")
  .checkpoint("both polled")
  .world(Thermostat.setTarget.hold())
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .advance("3 seconds")
  .checkpoint("saving")
  .world(Thermostat.setTarget.release())
  .checkpoint("saved")
  .advance("5 minutes")
  .checkpoint("checked once")
  .send(house, House.E.StartVacation({ until: 10 * HOUR }))
  .advance("2 minutes")
  .checkpoint("on vacation")
  .advance("1 hour")
  .checkpoint("an hour away")
  .send(house, House.E.Arrive())
  .checkpoint("home again")
  .advance("5 minutes")
  .checkpoint("checked twice");

/**
 * Two pause reasons on the lounge's polls: a save on the wire and a vacation. The save lands while
 * the vacation still holds, so the polls stay held; arriving home resumes them.
 */
export const pauseReasons = loungeWithSensors(homeStory("home/pause-reasons"))
  .advance("4 seconds")
  .world(Thermostat.setTarget.hold())
  .send(lounge, Room.E.SetTarget({ celsius: 21 }))
  .checkpoint("saving")
  .send(house, House.E.StartVacation({ until: 10 * HOUR }))
  .checkpoint("both")
  .world(Thermostat.setTarget.release())
  .advance("1 minute")
  .checkpoint("one cleared")
  .send(house, House.E.Arrive())
  .checkpoint("resumed")
  .advance("6 seconds")
  .checkpoint("polled after");

/**
 * A boost: idle when heating starts, armed by Boost, restarted by a second Boost, removed by
 * CancelBoost, then run to its end.
 */
export const boost = loungeWithSensors(homeStory("home/boost"))
  .send(lounge, Room.E.SetTarget({ celsius: 23 }))
  .checkpoint("heating")
  .send(lounge, Room.E.Boost())
  .advance("10 minutes")
  .checkpoint("boosted")
  .send(lounge, Room.E.Boost())
  .advance("25 minutes")
  .checkpoint("restarted")
  .send(lounge, Room.E.CancelBoost())
  .advance("30 minutes")
  .checkpoint("cancelled")
  .send(lounge, Room.E.Boost())
  .advance("30 minutes")
  .checkpoint("ended");

/**
 * The heating checks: three, five minutes apart, from a target; a new target restarts them from
 * the first step; an open window stops them; a target after it starts them again.
 */
export const heaterSteps = loungeWithSensors(homeStory("home/heater-steps"))
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .advance("15 minutes")
  .checkpoint("three checks")
  .advance("10 minutes")
  .checkpoint("complete")
  .send(lounge, Room.E.SetTarget({ celsius: 23 }))
  .advance("7 minutes")
  .checkpoint("restarted")
  .send(lounge, Room.E.WindowOpened())
  .advance("20 minutes")
  .checkpoint("window open")
  .send(lounge, Room.E.SetTarget({ celsius: 21 }))
  .advance("5 minutes")
  .checkpoint("after the window");

/**
 * Sensors come and go: a motion sensor is added mid-poll, a temperature sensor becomes a motion
 * sensor (its timer restarts at the shorter delay), one leaves and returns (a fresh timer).
 */
export const sensorChurn = loungeWithSensors(homeStory("home/sensor-churn"))
  .advance("30 seconds")
  .send(lounge, Room.E.AddSensor({ id: "m2", kind: "motion" }))
  .checkpoint("added")
  .send(lounge, Room.E.SensorChanged({ id: "t1", kind: "motion" }))
  .checkpoint("changed")
  .advance("10 seconds")
  .checkpoint("changed polled")
  .send(lounge, Room.E.RemoveSensor({ id: "m1" }))
  .advance("15 seconds")
  .checkpoint("removed")
  .send(lounge, Room.E.AddSensor({ id: "m1", kind: "motion" }))
  .checkpoint("returned")
  .advance("10 seconds")
  .checkpoint("returned polled");

/**
 * A vacation already over when it is set: its end is a millisecond in the past, so the house comes
 * home on the next turn, never in the turn that set it.
 */
export const vacationOver = homeStory("home/vacation-over")
  .ensure(house)
  .advance("1 hour")
  .send(house, House.E.StartVacation({ until: HOUR - 1 }))
  .checkpoint("set")
  .advance("0 millis")
  .checkpoint("home");

/**
 * The house leaves for a vacation of a day and the tab reloads at once: the restored deadline
 * brings the house home when the day is over.
 */
export const vacationReloaded = homeStory("home/vacation-reloaded")
  .ensure(house)
  .send(house, House.E.StartVacation({ until: 24 * HOUR }))
  .checkpoint("away")
  .reload()
  .ensure(house)
  .checkpoint("reloaded")
  .advance("25 hours")
  .checkpoint("home");

/**
 * The lounge reaches its target while the save is still on the wire: the polls stay held while it
 * is, and its ending, unhandled once the room is idle, still resumes them.
 */
export const reachedWhileSaving = loungeWithSensors(homeStory("home/reached-while-saving"))
  .advance("5 seconds")
  .world(Thermostat.setTarget.hold())
  .send(lounge, Room.E.SetTarget({ celsius: 21 }))
  .send(lounge, Room.E.Reached())
  .advance("5 seconds")
  .checkpoint("idle, saving")
  .world(Thermostat.setTarget.release())
  .checkpoint("saved unheard");

/**
 * A summer trip is booked: the trip tells the house, which is on vacation until the trip returns
 * and home again at that time.
 */
export const tripBooked = homeStory("home/trip-booked")
  .ensure(house)
  .ensure(trip("summer"))
  .send(trip("summer"), Trip.E.Book({ returns: 10 * HOUR }))
  .checkpoint("booked")
  .advance("10 hours")
  .checkpoint("back");

/**
 * Every named Story of the home fixture.
 */
export const stories = {
  usual,
  tripBooked,
  pauseReasons,
  boost,
  heaterSteps,
  sensorChurn,
  vacationOver,
  vacationReloaded,
  reachedWhileSaving,
};
