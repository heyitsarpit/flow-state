import { player } from "../machine.ts";
import { musicStory } from "../stories.ts";
import { roomOf } from "./load.ts";

/**
 * Two rooms play; a second later the first is disposed, and three more seconds pass.
 */
export const roomDisposed = musicStory("player/room-disposed")
  .ensure(roomOf(0))
  .ensure(roomOf(1))
  .send(roomOf(0), { _tag: "Play", trackId: "t0" })
  .send(roomOf(1), { _tag: "Play", trackId: "t1" })
  .advance("1 second")
  .dispose(roomOf(0))
  .advance("3 seconds")
  .checkpoint("later");

/**
 * A room plays for two seconds and the tab reloads.
 */
export const roomReloaded = musicStory("player/room-reloaded")
  .ensure(player)
  .send(player, { _tag: "Play", trackId: "t1" })
  .advance("2 seconds")
  .reload()
  .checkpoint("reloaded");
