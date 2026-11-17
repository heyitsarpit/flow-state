import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { musicApp } from "./app.ts";
import { samples, seededStress, stories } from "./stories/usual.ts";
import { emptyRoom, longRoomPlays, seekEdges } from "./stories/edges.ts";
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
    longRoomPlays,
    seekEdges,
  },
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [],
});
