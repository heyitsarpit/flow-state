import { Option } from "effect";
import { benchPoint, manifest } from "../manifest.ts";
import { musicTimed, musicTimedSetup } from "./app.ts";
import { samples, seededStress, sleepTimer, stories, timerSamples } from "./stories/usual.ts";
import { emptyRoom, longRoomPlays, seekEdges, sleepTimerEdges } from "./stories/edges.ts";
import { sixteenRooms, sixteenTimers, roomOf } from "./stories/load.ts";
import { roomDisposed, roomReloaded } from "./stories/structure.ts";

/**
 * The player fixture, as every runner reads it.
 */
export const player = manifest({
  name: "player",
  setup: musicTimedSetup,
  app: musicTimed,
  stories: {
    ...stories,
    sixteenRooms,
    roomDisposed,
    roomReloaded,
    emptyRoom,
    longRoomPlays,
    seekEdges,
    sleepTimer,
    sleepTimerEdges,
    sixteenTimers,
  },
  samples: [samples, timerSamples],
  stressSamples: [samples, timerSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [],
  bench: {
    probe: (n) => roomOf(n),
    persist: Option.none(),
    stories: [
      benchPoint(() => longRoomPlays, {
        series: "room-length",
        n: 1_000_000,
        unit: "chars",
        growth: "linear",
      }),
    ],
  },
});
