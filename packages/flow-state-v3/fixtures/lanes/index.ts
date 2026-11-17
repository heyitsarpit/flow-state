import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { lanesGrown } from "./app.ts";
import { samples, seededStress, stories, stressSamples } from "./stories/usual.ts";
import { negativeZero, twoSpellings } from "./stories/edges.ts";
import { crowd4, serializeAtCap } from "./stories/load.ts";
import { disposedWithWork, oneKeyTwoActors, reloadedWithWork } from "./stories/structure.ts";

/**
 * The lanes fixture, as every runner reads it.
 */
export const lanes = manifest({
  name: "lanes",
  app: lanesGrown,
  stories: {
    ...stories,
    serializeAtCap,
    crowd4,
    oneKeyTwoActors,
    disposedWithWork,
    reloadedWithWork,
    twoSpellings,
    negativeZero,
  },
  samples: [samples],
  stressSamples: [stressSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: stressSamples }),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: true, retainsUnknown: true },
    },
  ],
});
