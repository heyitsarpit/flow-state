import { actorRef } from "../../src/index.ts";
import { PayMachine } from "../services/shop/machines/pay.ts";
import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { storeSubscribed, storeSubscribedSetup } from "./app.ts";
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
  borrowedRecordsReload,
  oddRecordNames,
  sameCartTwice,
  unreadableName,
  waitsWhileBusy,
} from "./stories/findings.ts";
import { manyShoppers, quantityClicks } from "./stories/load.ts";
import { samples as storeSamples } from "./stories/samples.ts";
import {
  renewalBusyPay,
  renewalDamagedPay,
  renewalDisposingPay,
  renewalEndedPay,
  renewalEndingPay,
  renewalForgottenPay,
  renewalSamples,
  renewalUnopenedPay,
  renewalUnsurePay,
  checkoutSendSamples,
  checkoutSends,
} from "./stories/sends.ts";
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
  setup: storeSubscribedSetup,
  app: storeSubscribed,
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
    oddRecordNames,
    borrowedRecordsReload,
    checkoutSends,
    renewalBusyPay,
    renewalEndedPay,
    renewalUnsurePay,
    renewalUnopenedPay,
    renewalForgottenPay,
    renewalDamagedPay,
    renewalEndingPay,
    renewalDisposingPay,
  },
  samples: [samples, storeSamples, checkoutSendSamples, renewalSamples],
  stressSamples: [samples, storeSamples, checkoutSendSamples, renewalSamples],
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
