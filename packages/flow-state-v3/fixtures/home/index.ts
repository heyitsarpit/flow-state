import { Option } from "effect";
import { benchStress, benchTurn, manifest } from "../manifest.ts";
import { homeApp, homeSetup, roomOf } from "./app.ts";
import { hubSamples, hubStories } from "./stories/hub.ts";
import { loungeFormatFive, noSensors, reconnectBackoff, vacationEdges } from "./stories/edges.ts";
import { manyRooms, seededStress } from "./stories/load.ts";
import { samples } from "./stories/samples.ts";
import {
  houseFirst,
  reloadedPaused,
  roomFirst,
  roomsAddedMidTick,
  unusedOverdue,
  vacationEndedUnused,
} from "./stories/structure.ts";
import { stories } from "./stories/usual.ts";

/**
 * The home fixture, as every runner reads it.
 */
export const home = manifest({
  name: "home",
  setup: homeSetup,
  app: homeApp,
  stories: {
    ...stories,
    reloadedPaused,
    roomFirst,
    houseFirst,
    roomsAddedMidTick,
    unusedOverdue,
    vacationEndedUnused,
    vacationEdges,
    reconnectBackoff,
    noSensors,
    loungeFormatFive,
    ...hubStories,
    manyRooms,
    seededStress,
  },
  samples: [samples, hubSamples],
  stressSamples: [samples, hubSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: samples }),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: false, retainsUnknown: true },
    },
    {
      samples: hubSamples,
      reach: { writes: false, persisted: true, cancelsAcknowledging: false, retainsUnknown: false },
    },
  ],
  bench: {
    probe: (n) => roomOf(n),
    persist: Option.some(() => stories.usual),
    stories: [benchStress(benchTurn(() => manyRooms))],
  },
});
