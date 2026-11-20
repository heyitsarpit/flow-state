import { Option } from "effect";
import { benchStress, benchTurn, manifest } from "../manifest.ts";
import { homeApp, homeSetup, roomOf } from "./app.ts";
import { noSensors, vacationEdges } from "./stories/edges.ts";
import { manyRooms, seededStress } from "./stories/load.ts";
import { samples } from "./stories/samples.ts";
import { reloadedPaused, roomFirst, unusedOverdue } from "./stories/structure.ts";
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
    unusedOverdue,
    vacationEdges,
    noSensors,
    manyRooms,
    seededStress,
  },
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  // Out of the mix until the Turn I14 run rule judges a refused turn by its own actor: a refused
  // vacation beside a target save still being written is misread as that turn's work
  // (tests/rules/rules.test.ts).
  mix: Option.none(),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: false, retainsUnknown: true },
    },
  ],
  bench: {
    probe: (n) => roomOf(n),
    persist: Option.some(() => stories.usual),
    stories: [benchStress(benchTurn(() => manyRooms))],
  },
});
