import { Option } from "effect";
import { benchPoint, benchStress, benchTurn, manifest } from "../manifest.ts";
import { musicHome, musicHomeSetup } from "./app.ts";
import { samples, seededStress, sleepTimer, stories, timerSamples } from "./stories/usual.ts";
import { emptyRoom, longRoomPlays, seekEdges, sleepTimerEdges } from "./stories/edges.ts";
import { sixteenRooms, sixteenTimers, roomOf } from "./stories/load.ts";
import { roomDisposed, roomReloaded } from "./stories/structure.ts";
import {
  groupBadRoom,
  groupInGrace,
  groupOfSixtyFour,
  groupPlay,
  groupRoomEnded,
  groupReplays,
  groupPastGuard,
  groupRoomsAbsent,
  householdSamples,
} from "./stories/sends.ts";

/**
 * The player fixture, as every runner reads it.
 */
export const player = manifest({
  name: "player",
  setup: musicHomeSetup,
  app: musicHome,
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
    groupPlay,
    groupInGrace,
    groupRoomEnded,
    groupRoomsAbsent,
    groupBadRoom,
    groupOfSixtyFour,
    groupReplays,
    groupPastGuard,
  },
  samples: [samples, timerSamples, householdSamples],
  stressSamples: [samples, timerSamples, householdSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [],
  bench: {
    probe: (n) => roomOf(n),
    persist: Option.none(),
    stories: [
      benchStress(benchTurn(() => groupReplays)),
      benchPoint(() => longRoomPlays, {
        series: "room-length",
        n: 1_000_000,
        unit: "chars",
        growth: "linear",
      }),
    ],
  },
});
