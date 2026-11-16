import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { workspace } from "./machine.ts";
import { long, samples, seededStress, stories, stressSamples } from "./stories.ts";

/**
 * The session fixture, as every runner reads it.
 */
export const session = manifest({
  name: "session",
  app: workspace,
  stories,
  samples: [samples],
  stressSamples: [stressSamples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: stressSamples }),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: true, retainsUnknown: true },
    },
  ],
});
