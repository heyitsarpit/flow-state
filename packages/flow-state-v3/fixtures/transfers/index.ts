import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { bankGrown } from "./app.ts";
import { long, samples, seededStress, stories, stressSamples } from "./stories.ts";
import { centsEdges, idAtBound, twoSpellings } from "./stories/edges.ts";
import { manyAccounts, owedAtBoot } from "./stories/load.ts";
import { samples as formSamples } from "./stories/samples.ts";
import { chain, customerForgotten, formBoundLate, formFirst } from "./stories/structure.ts";
import { checkAndSend } from "./stories/usual.ts";

/**
 * The transfers fixture, as every runner reads it.
 */
export const transfers = manifest({
  name: "transfers",
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
    idAtBound,
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
});
