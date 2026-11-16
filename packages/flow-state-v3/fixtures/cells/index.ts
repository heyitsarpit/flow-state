import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { cellsShop } from "./machine.ts";
import { long, samples, seededStress, stories } from "./stories.ts";

/**
 * The cells fixture, as every runner reads it.
 */
export const cells = manifest({
  name: "cells",
  app: cellsShop,
  stories,
  samples: [samples],
  stressSamples: [samples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 56 },
  mix: Option.none(),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: true, retainsUnknown: true },
    },
  ],
});
