import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { authApp } from "./machine.ts";
import { long, samples, seededStress, stories } from "./stories.ts";

/**
 * The sign-in fixture, as every runner reads it.
 */
export const signIn = manifest({
  name: "sign-in",
  app: authApp,
  stories,
  samples: [samples],
  stressSamples: [samples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: false,
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: false, cancelsAcknowledging: false, retainsUnknown: false },
    },
  ],
});
