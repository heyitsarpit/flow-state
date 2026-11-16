import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { musicApp } from "./machine.ts";
import { samples, seededStress, stories } from "./stories.ts";
import { emptyRoom, roomAtBound, seekEdges } from "./stories/edges.ts";
import { sixteenRooms } from "./stories/load.ts";
import { roomDisposed, roomReloaded } from "./stories/structure.ts";

/**
 * The player fixture, as every runner reads it.
 */
export const player = manifest({
  name: "player",
  app: musicApp,
  stories: {
    ...stories,
    sixteenRooms,
    roomDisposed,
    roomReloaded,
    emptyRoom,
    roomAtBound,
    seekEdges,
  },
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [],
});
