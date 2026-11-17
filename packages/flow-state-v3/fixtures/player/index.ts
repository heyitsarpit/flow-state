import { Option } from "effect";
import { benchPoint, manifest } from "../manifest.ts";
import { musicApp, musicSetup } from "./app.ts";
import { samples, seededStress, stories } from "./stories/usual.ts";
import { emptyRoom, longRoomPlays, seekEdges } from "./stories/edges.ts";
import { sixteenRooms, roomOf } from "./stories/load.ts";
import { roomDisposed, roomReloaded } from "./stories/structure.ts";

/**
 * The player fixture, as every runner reads it.
 */
export const player = manifest({
  name: "player",
  setup: musicSetup,
  app: musicApp,
  stories: {
    ...stories,
    sixteenRooms,
    roomDisposed,
    roomReloaded,
    emptyRoom,
    longRoomPlays,
    seekEdges,
  },
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [],
  bench: {
    probe: (n) => roomOf(n),
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
