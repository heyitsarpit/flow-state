import { actorRef } from "../../../src/index.ts";
import { player, PlayerMachine } from "../machine.ts";
import { musicStory } from "../stories.ts";

/**
 * The player of a room with an empty name.
 */
export const emptyRoomPlayer = actorRef(PlayerMachine, { room: "" });

/**
 * The player of a room whose name is at a string's 262,144-byte bound.
 */
export const longRoom = actorRef(PlayerMachine, { room: "r".repeat(262_144) });

/**
 * A room with an empty name is opened.
 */
export const emptyRoom = musicStory("player/empty-room")
  .ensure(emptyRoomPlayer)
  .checkpoint("opened");

/**
 * A room named at the string bound plays.
 */
export const roomAtBound = musicStory("player/room-at-bound")
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
