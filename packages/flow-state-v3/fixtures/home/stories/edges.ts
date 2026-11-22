import { Fake } from "../../../src/host/testing/index.ts";
import { house, trip } from "../app.ts";
import { House } from "../machines/house.ts";
import { Room } from "../machines/room.ts";
import { Trip } from "../machines/trip.ts";
import { homeStory, lounge } from "./usual.ts";

/**
 * Vacations ending at the edges of a computed delay, all set at clock 0 so the end is the delay:
 * −1 ms, 0 ms, 2^31 ms (past the longest timer: the turn is refused and the house stays home) and
 * 2^31 − 1 ms (armed, still away a millisecond short, home at it).
 */
export const vacationEdges = homeStory("home/vacation-edges")
  .ensure(house)
  .send(house, House.E.StartVacation({ until: -1 }))
  .checkpoint("minus one")
  .advance("0 millis")
  .checkpoint("minus one fired")
  .send(house, House.E.StartVacation({ until: 0 }))
  .checkpoint("zero")
  .advance("0 millis")
  .checkpoint("zero fired")
  .send(house, House.E.StartVacation({ until: 2 ** 31 }))
  .checkpoint("past")
  .send(house, House.E.Arrive())
  .send(house, House.E.StartVacation({ until: 2 ** 31 - 1 }))
  .checkpoint("longest")
  .advance(2 ** 31 - 2)
  .checkpoint("just short")
  .advance("1 millis")
  .checkpoint("longest fired");

/**
 * A room left offline: its reconnect reminders back off fifty times (an hour, then 50 hours); the
 * third step, 2500 hours, is past the longest timer, so the second reminder lands and the
 * reminders end with one issue.
 */
export const reconnectBackoff = homeStory("home/reconnect-backoff")
  .ensure(lounge)
  .advance("1 hour")
  .checkpoint("first reminder")
  .advance("50 hours")
  .checkpoint("second reminder");

/**
 * A room with no sensors: nothing polls, and a vacation holds nothing.
 */
export const noSensors = homeStory("home/no-sensors")
  .ensure(house)
  .ensure(lounge)
  .send(lounge, Room.E.Connected())
  .send(house, House.E.StartVacation({ until: 3_600_000 }))
  .advance("10 minutes")
  .checkpoint("empty");

/**
 * The lounge's record as a format-5 build that already had the hub's devices saved it five seconds
 * into the usual journey, after the house left for a vacation: its temperature poll held by
 * Vacation with 55 seconds left, its motion poll due at 10 seconds.
 */
export const LOUNGE_FORMAT_FIVE =
  '{"baselines":{},"context":{"mode":{"machine":"Home/House","name":"home"}},"format":5,"gr' +
  'aph":{"Home/House/home":{}},"machine":"Home/Room","memory":{"boosts":0,"checks":[],"devi' +
  'ces":[],"notice":"","pings":{},"polls":{},"room":"lounge","sensors":[{"id":"t1","kind":"temperature"},{"id":"m1"' +
  ',"kind":"motion"}],"target":20},"name":"{\\"room\\":\\"lounge\\"}","schedules":[{"armedAt":0' +
  ',"attempt":0,"key":{"id":"t1"},"left":55000,"name":"poll","pausedBy":["Vacation"]},{"arm' +
  'edAt":0,"attempt":0,"dueAt":10000,"key":{"id":"m1"},"name":"poll"}],"seen":{"mode":"VACA' +
  'TION"},"state":"ONLINE.IDLE"}';

/**
 * The same record as an older build saved it, before the room had devices: its memory lacks
 * `devices` and `pings`.
 */
export const LOUNGE_BEFORE_DEVICES = LOUNGE_FORMAT_FIVE.replace('"devices":[],', "").replace(
  '"pings":{},',
  "",
);

/**
 * The lounge restored from the record an older build saved, before the room had devices.
 */
export const loungeBeforeDevices = homeStory("home/lounge-before-devices")
  .world(Fake.storage.put('actor/Home/Room/{"room":"lounge"}', LOUNGE_BEFORE_DEVICES))
  .reload()
  .ensure(house)
  .ensure(lounge)
  .checkpoint("restored");

/**
 * The lounge restored from its format-5 record at clock 0 with the house at home: the hold is
 * freed with its time left, the motion poll keeps its deadline, a sensor added next saves the
 * record in the current format, and each poll fires when its time is up (the step from format 5).
 */
export const loungeFormatFive = homeStory("home/lounge-format-five")
  .world(Fake.storage.put('actor/Home/Room/{"room":"lounge"}', LOUNGE_FORMAT_FIVE))
  .reload()
  .ensure(house)
  .ensure(lounge)
  .checkpoint("restored")
  .send(lounge, Room.E.AddSensor({ id: "m2", kind: "motion" }))
  .checkpoint("saved")
  .advance("10 seconds")
  .checkpoint("motion polled")
  .advance("45 seconds")
  .checkpoint("temperature polled");

/**
 * A sabbatical booked at clock 0 to return at 2^31 ms, a millisecond past the longest timer. The
 * house hears the vacation from the trip, which has already sent it and will not send it again: the
 * house goes on vacation and shows its homecoming refused as an issue. The same vacation sent by
 * hand can be sent again, so it is refused whole and the house stays home.
 */
export const tripPastLongest = homeStory("home/trip-past-longest")
  .ensure(house)
  .ensure(trip("sabbatical"))
  .send(trip("sabbatical"), Trip.E.Book({ returns: 2 ** 31 }))
  .checkpoint("booked")
  .send(house, House.E.Arrive())
  .send(house, House.E.StartVacation({ until: 2 ** 31 }))
  .checkpoint("sent by hand");
