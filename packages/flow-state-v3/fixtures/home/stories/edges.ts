import { house } from "../app.ts";
import { House } from "../machines/house.ts";
import { Room } from "../machines/room.ts";
import { homeStory, lounge } from "./usual.ts";

/**
 * Vacations ending at the edges of a computed delay, each set at the start of a fresh hour: −1 ms,
 * 0 ms, 2^31 − 1 ms (armed, home a millisecond after a millisecond short) and 2^31 ms, past the
 * longest timer, whose turn is refused and leaves the house away.
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
 * A room with no sensors: nothing polls, and a vacation holds nothing.
 */
export const noSensors = homeStory("home/no-sensors")
  .ensure(house)
  .ensure(lounge)
  .send(lounge, Room.E.Connected())
  .send(house, House.E.StartVacation({ until: 3_600_000 }))
  .advance("10 minutes")
  .checkpoint("empty");
