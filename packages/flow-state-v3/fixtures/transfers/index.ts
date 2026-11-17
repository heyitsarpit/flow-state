import { actorRef } from "../../src/index.ts";
import { TransfersMachine } from "./machines/transfers.ts";
import { Option } from "effect";
import { benchPoint, manifest } from "../manifest.ts";
import { bankGrown, bankGrownSetup } from "./app.ts";
import {
  long,
  samples,
  seededStress,
  stories,
  stressSamples,
  checkAndSend,
} from "./stories/usual.ts";
import { centsEdges, longId, twoSpellings } from "./stories/edges.ts";
import { manyAccounts, owedAtBoot } from "./stories/load.ts";
import { samples as formSamples } from "./stories/samples.ts";
import { chain, customerForgotten, formBoundLate, formFirst } from "./stories/structure.ts";

/**
 * The transfers fixture, as every runner reads it.
 */
export const transfers = manifest({
  name: "transfers",
  setup: bankGrownSetup,
  app: bankGrown,
  stories: {
    ...stories,
    formBoundLate,
    checkAndSend,
    chain,
    formFirst,
    customerForgotten,
    manyAccounts,
    owedAtBoot,
    centsEdges,
    longId,
    twoSpellings,
  },
  samples: [samples, formSamples],
  stressSamples: [stressSamples, formSamples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 45 },
  mix: Option.some({ usual: samples, stress: stressSamples }),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: true, retainsUnknown: true },
    },
    {
      samples: formSamples,
      reach: { writes: false, persisted: true, cancelsAcknowledging: false, retainsUnknown: false },
    },
  ],
  bench: {
    probe: (n) => actorRef(TransfersMachine, `acct-${String(n)}`),
    stories: [
      benchPoint(() => longId, {
        series: "id-length",
        n: 100_000,
        unit: "chars",
        growth: "linear",
      }),
    ],
  },
});
