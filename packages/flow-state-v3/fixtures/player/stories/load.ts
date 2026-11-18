import { actorRef } from "../../../src/index.ts";
import { timerOf } from "../app.ts";
import { PlayerMachine } from "../machines/player.ts";
import { after, musicStory, timedStory } from "./usual.ts";

const ROOMS = Array.from({ length: 16 }, (_, n) => n);

/**
 * The player of the `n`th of many rooms.
 */
export const roomOf = (n: number) => actorRef(PlayerMachine, { room: `room-${String(n)}` });

const seek = { _tag: "Seek", pos: 10 } as const;

/**
 * Sixteen rooms each play a track; each gets a burst of three seeks to 10 seconds; three seconds
 * pass.
 */
export const sixteenRooms = ROOMS.reduce(
  (story, n) => story.send(roomOf(n), seek).send(roomOf(n), seek).send(roomOf(n), seek),
  ROOMS.reduce(
    (story, n) =>
      story.ensure(roomOf(n)).send(roomOf(n), { _tag: "Play", trackId: `t${String(n)}` }),
    musicStory("player/sixteen-rooms"),
  ),
)
  .advance("3 seconds")
  .checkpoint("end");

const TIMERS = Array.from({ length: 16 }, (_, n) => n);

/**
 * Sixteen rooms each set their timer for `n` minutes (a first guess until the bench re-measures
 * it); sixteen minutes pass.
 */
export const sixteenTimers = TIMERS.reduce(
  (story, n) =>
    story.ensure(timerOf(n)).send(timerOf(n), { _tag: "Set", after: after(n * 60_000) }),
  timedStory("player/sixteen-timers"),
)
  .advance("16 minutes")
  .checkpoint("end");
