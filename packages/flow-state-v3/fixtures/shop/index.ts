import { actorRef } from "../../src/index.ts";
import { PayMachine } from "../services/shop/machines/pay.ts";
import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { store, storeSetup } from "./app.ts";
import {
  long,
  samples,
  seededStress,
  stories,
  browse,
  checkoutSteps,
  guestBrowse,
} from "./stories/usual.ts";
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
  unreadableName,
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

/**
 * The shop fixture, the shop around the checkout, as every runner reads it.
 */
export const shop = manifest({
  name: "shop",
  setup: storeSetup,
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
    unreadableName,
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
  bench: {
    probe: (n) => actorRef(PayMachine, `checkout-${String(n)}`),
    persist: Option.some(() => long),
    stories: [],
  },
});
