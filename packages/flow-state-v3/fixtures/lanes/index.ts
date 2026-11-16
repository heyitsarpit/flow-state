import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { lanesApp } from "./machine.ts";
import { samples, seededStress, stories, stressSamples } from "./stories.ts";

/**
 * The lanes fixture, as every runner reads it.
 */
export const lanes = manifest({
  name: "lanes",
  app: lanesApp,
  stories,
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
