import { samplesOf } from "../../../src/host/testing/index.ts";
import { actorRef } from "../../../src/index.ts";
import { player, timerOf } from "../app.ts";
import { Speaker } from "../server/speaker.ts";
import { Player, PlayerMachine } from "../machines/player.ts";
import { SleepTimer } from "../machines/sleep-timer.ts";
import { after, LONGEST_MS, musicStory, setLongest, setNow, timedStory } from "./usual.ts";

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
  .send(longRoom, Player.E.Play({ trackId: "t1" }))
  .checkpoint("playing");

/**
 * Players of an empty room and a million-character room, for generated runs: each plays, pauses,
 * resumes and stops, and the speaker refuses a track.
 */
export const roomEdgeSamples = samplesOf({
  id: "player-room-edges",
  story: musicStory("player-room-edges/samples"),
  names: { setup: "musicSetup", fixtures: ["SpeakerFake"] },
  actors: { emptyRoomPlayer, longRoom },
  servers: { Speaker },
  failures: [Speaker.block({ trackId: "t1" })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(emptyRoomPlayer, Player.E.Play({ trackId: "t1" }))
      .send(longRoom, Player.E.Play({ trackId: "t1" }))
      .send(emptyRoomPlayer, Player.E.Pause())
      .send(longRoom, Player.E.Resume())
      .send(emptyRoomPlayer, Player.E.Stop()),
});

/**
 * A listener seeks past the end of the track, then to a negative position, a second apart.
 */
export const seekEdges = musicStory("player/seek-edges")
  .ensure(player)
  .send(player, Player.E.Play({ trackId: "t1" }))
  .send(player, Player.E.Seek({ pos: 100_000 }))
  .advance("1 second")
  .checkpoint("past")
  .send(player, Player.E.Seek({ pos: -5 }))
  .advance("1 second")
  .checkpoint("negative");

/**
 * Four timers at the edges of a delay: 0 ms and −1 ms, asleep at once; 2^31 − 1 ms, armed a
 * millisecond short and asleep at it; and 2^31 ms, past the longest timer, whose Set is refused.
 */
export const sleepTimerEdges = timedStory("player/sleep-timer-edges")
  .ensure(timerOf(0))
  .ensure(timerOf(1))
  .ensure(timerOf(2))
  .ensure(timerOf(3))
  .send(timerOf(0), setNow)
  .send(timerOf(1), setLongest)
  .send(timerOf(2), SleepTimer.E.Set({ after: after(-1) }))
  .send(timerOf(3), SleepTimer.E.Set({ after: after(LONGEST_MS + 1) }))
  .advance("0 millis")
  .checkpoint("set")
  .advance(LONGEST_MS - 1)
  .checkpoint("just short")
  .advance("1 millis")
  .checkpoint("asleep");
