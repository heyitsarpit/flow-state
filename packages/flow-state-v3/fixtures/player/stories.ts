import { samplesOf, Story } from "../../src/host/testing/index.ts";
import { musicSetup, player } from "./machine.ts";
import { Speaker, SpeakerFake } from "./server.ts";

/**
 * The player app over its speaker fake, with no steps yet: every player Story starts here.
 */
export const musicStory = (id: string) => Story.app(musicSetup, { id, fixtures: [SpeakerFake] });

const playTrack = (trackId: string) => ({ _tag: "Play", trackId }) as const;

const PAUSE = { _tag: "Pause" } as const;

const RESUME = { _tag: "Resume" } as const;

const STOP = { _tag: "Stop" } as const;

/**
 * A listener plays a track for three seconds, pauses, stops, resumes into the pause by history,
 * plays on, seeks, is refused a blocked track, and pauses while a play is still on the wire so its
 * start lands late.
 */
export const usual = musicStory("player/usual")
  .ensure(player)
  .send(player, playTrack("t1"))
  .checkpoint("playing")
  .advance("3 seconds")
  .checkpoint("three seconds")
  .send(player, PAUSE)
  .advance("5 seconds")
  .checkpoint("paused")
  .send(player, STOP)
  .checkpoint("stopped")
  .send(player, RESUME)
  .checkpoint("resumed into the pause")
  .send(player, RESUME)
  .advance("1500 millis")
  .checkpoint("playing again")
  .send(player, { _tag: "Seek", pos: 10 })
  .advance("900 millis")
  .checkpoint("sought")
  .advance("200 millis")
  .checkpoint("ticked after the seek")
  .world(Speaker.block({ trackId: "t2" }))
  .send(player, playTrack("t2"))
  .checkpoint("refused")
  .world(Speaker.play.hold())
  .send(player, playTrack("t3"))
  .send(player, PAUSE)
  .world(Speaker.play.release())
  .checkpoint("late start");

type MusicStory = ReturnType<typeof musicStory>;

const listen = (story: MusicStory, n: number) => {
  const started = story.send(player, playTrack(`t${n}`)).advance(`${1 + (n % 3)} seconds`);
  const paused = n % 2 === 0 ? started.send(player, PAUSE).advance("2 seconds") : started;
  const sought = n % 3 === 0 ? paused.send(player, { _tag: "Seek", pos: n }) : paused;
  const stopped = n % 4 === 0 ? sought.send(player, STOP).send(player, RESUME) : sought;

  const held =
    n % 5 === 0
      ? stopped
          .world(Speaker.play.hold())
          .send(player, playTrack(`late${n}`))
          .send(player, PAUSE)
          .world(Speaker.play.release())
      : stopped;

  return held.send(player, RESUME).advance("1500 millis");
};

/**
 * Forty listens through pauses, seeks, stops resumed by history and late starts: about three
 * hundred steps, for the stress run and the bench.
 */
export const stress = Array.from({ length: 40 }, (_, n) => n)
  .reduce(listen, musicStory("player/stress").ensure(player))
  .checkpoint("end");

const SEEK = { _tag: "Seek", pos: 30 } as const;

/**
 * What a listener and the speaker can do, for generated runs: play, pause, resume, stop and seek;
 * the speaker refuses a track.
 */
export const samples = samplesOf({
  id: "player",
  story: musicStory("player/samples"),
  names: { setup: "musicSetup", fixtures: ["SpeakerFake"] },
  actors: { player },
  servers: { Speaker },
  failures: [Speaker.block({ trackId: "t1" })],
  landedFailures: [],
  values: { play: playTrack("t1"), pause: PAUSE, resume: RESUME, stop: STOP, seek: SEEK },
  controls: [],
  steps: (story) =>
    story
      .send(player, playTrack("t1"))
      .send(player, PAUSE)
      .send(player, RESUME)
      .send(player, SEEK)
      .send(player, STOP),
});

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, stress };
