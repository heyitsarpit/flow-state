import { Option } from "effect";
import { benchStress, benchTurn, manifest } from "../manifest.ts";
import { homeGrownApp, homeSetup, roomOf } from "./app.ts";
import { hubManyDevices, hubSamples, hubStories, hubUsual } from "./stories/hub.ts";
import {
  chimeLocal,
  chimeRingsThrice,
  loungeBeforeDevices,
  loungeFormatFive,
  noSensors,
  reconnectBackoff,
  tripPastLongest,
  vacationEdges,
} from "./stories/edges.ts";
import { manyRooms, seededStress } from "./stories/load.ts";
import {
  cardUsual,
  disposedMidRead,
  readingsSamples,
  releaseMeetsSchedule,
} from "./stories/readings.ts";
import { samples, tripSamples } from "./stories/samples.ts";
import {
  houseFirst,
  reloadedPaused,
  roomFirst,
  roomsAddedMidTick,
  unusedOverdue,
  unusedWhileSaving,
  vacationEndedUnused,
} from "./stories/structure.ts";
import { stories } from "./stories/usual.ts";

/**
 * The home fixture, as every runner reads it.
 */
export const home = manifest({
  name: "home",
  setup: homeSetup,
  app: homeGrownApp,
  stories: {
    ...stories,
    cardUsual,
    disposedMidRead,
    releaseMeetsSchedule,
    chimeRingsThrice,
    chimeLocal,
    reloadedPaused,
    roomFirst,
    houseFirst,
    roomsAddedMidTick,
    unusedOverdue,
    unusedWhileSaving,
    vacationEndedUnused,
    vacationEdges,
    tripPastLongest,
    reconnectBackoff,
    noSensors,
    loungeFormatFive,
    loungeBeforeDevices,
    ...hubStories,
    manyRooms,
    seededStress,
  },
  samples: [samples, hubSamples, tripSamples, readingsSamples],
  stressSamples: [samples, hubSamples, tripSamples, readingsSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: samples }),
  pairs: [
    {
      samples,
      reach: {
        writes: true,
        persisted: true,
        cancelsAcknowledging: false,
        retainsUnknown: true,
        storesBeside: false,
      },
    },
    {
      samples: hubSamples,
      reach: {
        writes: false,
        persisted: true,
        cancelsAcknowledging: false,
        retainsUnknown: false,
        storesBeside: false,
      },
    },
    {
      samples: tripSamples,
      reach: {
        writes: false,
        persisted: true,
        cancelsAcknowledging: false,
        retainsUnknown: false,
        storesBeside: false,
      },
    },
    {
      samples: readingsSamples,
      reach: {
        writes: false,
        persisted: false,
        cancelsAcknowledging: false,
        retainsUnknown: false,
        storesBeside: false,
      },
    },
  ],
  bench: {
    probe: (n) => roomOf(n),
    persist: Option.some(() => stories.usual),
    stories: [
      benchStress(benchTurn(() => manyRooms)),
      benchTurn(() => hubUsual),
      benchTurn(() => hubManyDevices),
    ],
  },
});
