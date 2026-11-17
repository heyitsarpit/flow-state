import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { cellsShop } from "./app.ts";
import { long, samples, seededStress, stories } from "./stories/usual.ts";
import { emptyIds, keyAtBound, keyPastBound } from "./stories/edges.ts";
import { disposedOnWire, neverSentDisposed, reloadedOnWire } from "./stories/structure.ts";

/**
 * The cells fixture, as every runner reads it.
 */
export const cells = manifest({
  name: "cells",
  app: cellsShop,
  stories: {
    ...stories,
    disposedOnWire,
    neverSentDisposed,
    reloadedOnWire,
    emptyIds,
    keyAtBound,
    keyPastBound,
  },
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
