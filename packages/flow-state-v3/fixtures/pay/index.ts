import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { store } from "./app.ts";
import { long, samples, seededStress, stories } from "./stories.ts";
import { busyEdges } from "./stories/edges.ts";
import {
  failingLineAlone,
  independentLines,
  quantityLost,
  quantityNotSaved,
  quantityZero,
  removedLineAnswer,
  refusedAddAlone,
  sameCartTwice,
  waitsWhileBusy,
} from "./stories/findings.ts";
import { manyShoppers, quantityClicks } from "./stories/load.ts";
import { samples as storeSamples } from "./stories/samples.ts";
import {
  chain,
  flowBoundLate,
  flowFirst,
  reloadedMidAdd,
  shopperForgotten,
} from "./stories/structure.ts";
import { browse, checkoutSteps, guestBrowse } from "./stories/usual.ts";

/**
 * The pay fixture, the shop around the checkout, as every runner reads it.
 */
export const pay = manifest({
  name: "pay",
  app: store,
  stories: {
    ...stories,
    flowBoundLate,
    browse,
    guestBrowse,
    checkoutSteps,
    independentLines,
    failingLineAlone,
    refusedAddAlone,
    quantityZero,
    sameCartTwice,
    waitsWhileBusy,
    quantityLost,
    quantityNotSaved,
    removedLineAnswer,
    quantityClicks,
    manyShoppers,
    chain,
    flowFirst,
    shopperForgotten,
    reloadedMidAdd,
    busyEdges,
  },
  samples: [samples, storeSamples],
  stressSamples: [samples, storeSamples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: samples }),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: false, retainsUnknown: true },
    },
    {
      samples: storeSamples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: false, retainsUnknown: true },
    },
  ],
});
