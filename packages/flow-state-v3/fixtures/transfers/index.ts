import { actorRef } from "../../src/index.ts";
import { TransfersMachine } from "./machines/transfers.ts";
import { Option } from "effect";
import { benchPoint, benchStress, benchTurn, manifest } from "../manifest.ts";
import { bankReminding, bankRemindingSetup } from "./app.ts";
import { reminderSamples, reminderStories } from "./stories/reminders.ts";
import {
  switcherEdges,
  switcherRecent,
  switcherReloaded,
  switcherSamples,
} from "./stories/context.ts";
import {
  long,
  samples,
  seededStress,
  stories,
  stressSamples,
  checkAndSend,
  standingOrder,
  leaveWhileSending,
  interruptCleanupFails,
  owedForgotten,
  unsureAccountRemoved,
} from "./stories/usual.ts";
import {
  centsEdges,
  forgottenRetiredWire,
  longId,
  orderDateEdges,
  twoSpellings,
} from "./stories/edges.ts";
import { manyAccounts, manyOrders, orderOffline, owedAtBoot } from "./stories/load.ts";
import { visibilityStories } from "./stories/visibility.ts";
import {
  samples as formSamples,
  orderSamples,
  plannedSamples,
  plannedStressSamples,
} from "./stories/samples.ts";
import {
  chain,
  customerForgotten,
  formBoundLate,
  formFirst,
  orderChain,
  orderCustomerForgotten,
  orderFirst,
} from "./stories/structure.ts";

/**
 * The transfers fixture, as every runner reads it.
 */
export const transfers = manifest({
  name: "transfers",
  setup: bankRemindingSetup,
  app: bankReminding,
  stories: {
    ...stories,
    ...visibilityStories,
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
    standingOrder,
    orderDateEdges,
    manyOrders,
    orderCustomerForgotten,
    orderFirst,
    orderChain,
    orderOffline,
    leaveWhileSending,
    interruptCleanupFails,
    unsureAccountRemoved,
    owedForgotten,
    forgottenRetiredWire,
    switcherRecent,
    switcherEdges,
    switcherReloaded,
    ...reminderStories,
  },
  samples: [samples, formSamples, orderSamples, plannedSamples, switcherSamples, reminderSamples],
  stressSamples: [
    stressSamples,
    formSamples,
    orderSamples,
    plannedStressSamples,
    switcherSamples,
    reminderSamples,
  ],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 45 },
  mix: Option.some({ usual: plannedSamples, stress: plannedStressSamples }),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: true, retainsUnknown: true },
    },
    {
      samples: formSamples,
      reach: { writes: false, persisted: true, cancelsAcknowledging: false, retainsUnknown: false },
    },
    {
      samples: orderSamples,
      reach: { writes: false, persisted: true, cancelsAcknowledging: false, retainsUnknown: false },
    },
    {
      samples: reminderSamples,
      reach: { writes: false, persisted: true, cancelsAcknowledging: false, retainsUnknown: false },
    },
  ],
  bench: {
    probe: (n) => actorRef(TransfersMachine, `acct-${String(n)}`),
    persist: Option.some(() => long),
    stories: [
      benchTurn(() => standingOrder),
      benchStress(benchTurn(() => manyOrders)),
      benchPoint(() => longId, {
        series: "id-length",
        n: 100_000,
        unit: "chars",
        growth: "linear",
      }),
    ],
  },
});
