import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { bank } from "./machine.ts";
import { long, samples, seededStress, stories, stressSamples } from "./stories.ts";

/**
 * The transfers fixture, as every runner reads it.
 */
export const transfers = manifest({
  name: "transfers",
  app: bank,
  stories,
  samples: [samples],
  stressSamples: [stressSamples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 45 },
  mix: true,
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: true, retainsUnknown: true },
    },
  ],
});
