import { actorRef } from "../../../src/index.ts";
import { player, timerOf } from "../app.ts";
import { PlayerMachine } from "../machines/player.ts";
import { LONGEST_MS, musicStory, setLongest, setNow, timedStory } from "./usual.ts";

/**
 * The player of a room with an empty name.
 */
export const emptyRoomPlayer = actorRef(PlayerMachine, { room: "" });

/**
 * The player of a room whose name is a million characters long.
 */
export const longRoom = actorRef(PlayerMachine, { room: "r".repeat(1_000_000) });

/**
 * A room with an empty name is opened.
 */
export const emptyRoom = musicStory("player/empty-room")
  .ensure(emptyRoomPlayer)
  .checkpoint("opened");

/**
 * A room with a million-character name plays.
 */
export const longRoomPlays = musicStory("player/long-room")
  .ensure(longRoom)
  .send(longRoom, { _tag: "Play", trackId: "t1" })
  .checkpoint("playing");

/**
 * A listener seeks past the end of the track, then to a negative position, a second apart.
 */
export const seekEdges = musicStory("player/seek-edges")
  .ensure(player)
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, { _tag: "Seek", pos: 100_000 })
  .advance("1 second")
  .checkpoint("past")
  .send(player, { _tag: "Seek", pos: -5 })
  .advance("1 second")
  .checkpoint("negative");

/**
 * Two timers at the edges of a delay: 0 ms, asleep at once, and 2^31 - 1 ms, armed a millisecond
 * short and asleep at it.
 */
export const sleepTimerEdges = timedStory("player/sleep-timer-edges")
  .ensure(timerOf(0))
  .ensure(timerOf(1))
  .send(timerOf(0), setNow)
  .send(timerOf(1), setLongest)
  .advance("0 millis")
  .checkpoint("set")
  .advance(LONGEST_MS - 1)
  .checkpoint("just short")
  .advance("1 millis")
  .checkpoint("asleep");
