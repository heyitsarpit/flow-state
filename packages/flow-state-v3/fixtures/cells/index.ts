import { actorRef } from "../../src/index.ts";
import { CellsMachine } from "./machines/cells.ts";
import { Option } from "effect";
import { benchPoint, manifest } from "../manifest.ts";
import { cellsShop, cellsSetup } from "./app.ts";
import { long, samples, seededStress, stories } from "./stories/usual.ts";
import { emptyIds, longKey } from "./stories/edges.ts";
import { disposedOnWire, neverSentDisposed, reloadedOnWire } from "./stories/structure.ts";

/**
 * The cells fixture, as every runner reads it.
 */
export const cells = manifest({
  name: "cells",
  setup: cellsSetup,
  app: cellsShop,
  stories: {
    ...stories,
    disposedOnWire,
    neverSentDisposed,
    reloadedOnWire,
    emptyIds,
    longKey,
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
  bench: {
    probe: (n) => actorRef(CellsMachine, `checkout-${String(n)}`),
    stories: [
      benchPoint(() => longKey, {
        series: "key-length",
        n: 100_000,
        unit: "chars",
        growth: "linear",
      }),
    ],
  },
});
