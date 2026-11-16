import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { gitApp } from "./machine.ts";
import { long, samples, seededStress, stories } from "./stories.ts";

/**
 * The sync fixture, as every runner reads it.
 */
export const sync = manifest({
  name: "sync",
  app: gitApp,
  stories,
  samples: [samples],
  stressSamples: [samples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: false,
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: false, cancelsAcknowledging: false, retainsUnknown: true },
    },
  ],
});
