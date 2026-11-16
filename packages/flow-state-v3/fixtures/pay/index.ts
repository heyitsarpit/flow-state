import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { shop } from "./machine.ts";
import { long, samples, seededStress, stories } from "./stories.ts";

/**
 * The pay fixture, as every runner reads it.
 */
export const pay = manifest({
  name: "pay",
  app: shop,
  stories,
  samples: [samples],
  stressSamples: [samples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: true,
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: false, retainsUnknown: true },
    },
  ],
});
