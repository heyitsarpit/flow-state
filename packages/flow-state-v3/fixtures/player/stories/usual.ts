import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import { musicSetup, player } from "../app.ts";
import { Speaker } from "../server/speaker.ts";
import { SpeakerFake } from "../server/layer.ts";

/**
 * The player app over its speaker fake, with no steps yet: every player Story starts here.
 */
export const musicStory = (id: string) => Story.app(musicSetup, { id, fixtures: [SpeakerFake] });

const playTrack = (trackId: string) => ({ _tag: "Play", trackId }) as const;

const pause = { _tag: "Pause" } as const;

const resume = { _tag: "Resume" } as const;

const stop = { _tag: "Stop" } as const;

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
  .send(player, pause)
  .advance("5 seconds")
  .checkpoint("paused")
  .send(player, stop)
  .checkpoint("stopped")
  .send(player, resume)
  .checkpoint("resumed into the pause")
  .send(player, resume)
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
  .send(player, pause)
  .world(Speaker.play.release())
  .checkpoint("late start");

type MusicStory = ReturnType<typeof musicStory>;

const listen = (story: MusicStory, n: number) => {
  const started = story.send(player, playTrack(`t${n}`)).advance(`${1 + (n % 3)} seconds`);
  const paused = n % 2 === 0 ? started.send(player, pause).advance("2 seconds") : started;
  const sought = n % 3 === 0 ? paused.send(player, { _tag: "Seek", pos: n }) : paused;
  const stopped = n % 4 === 0 ? sought.send(player, stop).send(player, resume) : sought;

  const held =
    n % 5 === 0
      ? stopped
          .world(Speaker.play.hold())
          .send(player, playTrack(`late${n}`))
          .send(player, pause)
          .world(Speaker.play.release())
      : stopped;

  return held.send(player, resume).advance("1500 millis");
};

/**
 * Forty listens through pauses, seeks, stops resumed by history and late starts: about three
 * hundred steps, for the stress run and the bench.
 */
export const stress = Array.from({ length: 40 }, (_, n) => n)
  .reduce(listen, musicStory("player/stress").ensure(player))
  .checkpoint("end");

const seek = { _tag: "Seek", pos: 30 } as const;

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
  values: { play: playTrack("t1"), pause, resume, stop, seek },
  controls: [],
  steps: (story) =>
    story
      .send(player, playTrack("t1"))
      .send(player, pause)
      .send(player, resume)
      .send(player, seek)
      .send(player, stop),
});

/**
 * A stress run from seed 36, printed by the generator and pasted here. The reload sweep and the
 * bench run it as any Story.
 */
export const seededStress = Story.app(musicSetup, {
  id: "player/stress-36",
  fixtures: [SpeakerFake],
})
  .world(Speaker.block({ trackId: "t1" }))
  .ensure(player)
  .send(player, stop)
  .send(player, stop)
  .send(player, pause)
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, resume)
  .send(player, stop)
  .send(player, stop)
  .send(player, stop)
  .reload({ reattach: false })
  .send(player, pause)
  .send(player, resume)
  .send(player, pause)
  .send(player, stop)
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, resume)
  .send(player, seek)
  .send(player, stop)
  .send(player, seek)
  .send(player, resume)
  .world(Fake.network.offline())
  .send(player, stop)
  .dispose(player, { how: "forget" })
  .send(player, seek)
  .send(player, pause)
  .advance("20 millis")
  .disposeRuntime()
  .reload()
  .advance("7 millis")
  .send(player, pause)
  .advance("20 millis")
  .send(player, resume)
  .advance("3 millis")
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, stop)
  .advance("16 millis")
  .send(player, stop)
  .send(player, stop)
  .send(player, seek)
  .send(player, pause)
  .send(player, seek)
  .send(player, stop)
  .send(player, stop)
  .send(player, resume)
  .send(player, { _tag: "Play", trackId: "t1" })
  .advance("5 millis")
  .send(player, resume)
  .advance("2 millis")
  .send(player, stop)
  .advance("17 millis")
  .send(player, resume)
  .send(player, seek)
  .send(player, seek)
  .advance("18 millis")
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, pause)
  .send(player, pause)
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, pause)
  .send(player, { _tag: "Play", trackId: "t1" })
  .reload({ reattach: false })
  .advance("4 millis")
  .send(player, pause)
  .advance("10 millis")
  .send(player, stop)
  .send(player, seek)
  .send(player, resume)
  .send(player, pause)
  .send(player, resume)
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, stop)
  .send(player, pause)
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, seek)
  .advance("20 millis")
  .send(player, stop)
  .send(player, stop)
  .send(player, resume)
  .send(player, seek)
  .advance("15 millis")
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, resume)
  .send(player, seek)
  .advance("8 millis")
  .send(player, resume)
  .send(player, stop)
  .advance("7 millis")
  .send(player, { _tag: "Play", trackId: "t1" })
  .send(player, seek)
  .send(player, stop)
  .advance("15 millis")
  .send(player, { _tag: "Play", trackId: "t1" })
  .advance("15 millis")
  .send(player, { _tag: "Play", trackId: "t1" })
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, stress, seededStress };
