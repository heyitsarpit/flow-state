import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { musicApp } from "./machine.ts";
import { samples, seededStress, stories } from "./stories.ts";

/**
 * The player fixture, as every runner reads it.
 */
export const player = manifest({
  name: "player",
  app: musicApp,
  stories,
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: false,
  pairs: [],
});
