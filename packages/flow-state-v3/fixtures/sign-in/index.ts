import { Option } from "effect";
import { benchPoint, benchStress, benchTurn, manifest } from "../manifest.ts";
import { authIdle, authIdleSetup, sessionOf } from "./app.ts";
import { idleSamples, idleStories } from "./stories/idle.ts";
import {
  bannerLoadFails,
  bannerNewAccount,
  bannerReloaded,
  bannerSamples,
  bannerSignsIn,
} from "./stories/context.ts";
import {
  long,
  samples,
  seededStress,
  stories,
  handleRetry,
  trustDevice,
  unsureSaveRemoved,
} from "./stories/usual.ts";
import {
  deviceDateEdges,
  longEmail,
  emptyCode,
  emptyEmail,
  signOutRetiredLink,
} from "./stories/edges.ts";
import { blankHandle, submitTwice, unconfirmedPrefill } from "./stories/findings.ts";
import {
  manyDevices,
  manyNewSessions,
  manyScreens,
  manySessions,
  reloadInLockout,
} from "./stories/load.ts";
import {
  deviceSamples,
  emailEdgeSamples,
  recordSamples,
  samples as sessionSamples,
} from "./stories/samples.ts";
import {
  deviceChain,
  deviceFirst,
  deviceSessionForgotten,
  readCleanupDies,
  reloadedChoosing,
  reloadedMidHandle,
  returnSavedLate,
  saveCleanupDies,
  screenFirst,
  signOutForgets,
} from "./stories/structure.ts";

/**
 * The sign-in fixture, as every runner reads it.
 */
export const signIn = manifest({
  name: "sign-in",
  setup: authIdleSetup,
  app: authIdle,
  stories: {
    ...stories,
    bannerSignsIn,
    bannerNewAccount,
    bannerLoadFails,
    bannerReloaded,
    returnSavedLate,
    reloadedMidHandle,
    reloadedChoosing,
    handleRetry,
    unsureSaveRemoved,
    blankHandle,
    submitTwice,
    unconfirmedPrefill,
    signOutForgets,
    screenFirst,
    readCleanupDies,
    saveCleanupDies,
    manyScreens,
    manySessions,
    manyNewSessions,
    emptyEmail,
    longEmail,
    emptyCode,
    reloadInLockout,
    trustDevice,
    deviceDateEdges,
    manyDevices,
    deviceSessionForgotten,
    deviceFirst,
    deviceChain,
    signOutRetiredLink,
    ...idleStories,
  },
  samples: [
    samples,
    sessionSamples,
    emailEdgeSamples,
    deviceSamples,
    bannerSamples,
    idleSamples,
    recordSamples,
  ],
  stressSamples: [
    samples,
    sessionSamples,
    emailEdgeSamples,
    deviceSamples,
    bannerSamples,
    idleSamples,
    recordSamples,
  ],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [
    {
      samples,
      reach: {
        writes: true,
        persisted: false,
        cancelsAcknowledging: false,
        retainsUnknown: false,
        storesBeside: false,
      },
    },
    {
      samples: sessionSamples,
      reach: {
        writes: true,
        persisted: true,
        cancelsAcknowledging: false,
        retainsUnknown: true,
        storesBeside: false,
      },
    },
    {
      samples: deviceSamples,
      reach: {
        writes: false,
        persisted: true,
        cancelsAcknowledging: false,
        retainsUnknown: false,
        storesBeside: false,
      },
    },
    {
      samples: idleSamples,
      reach: {
        writes: false,
        persisted: true,
        cancelsAcknowledging: false,
        retainsUnknown: false,
        storesBeside: false,
      },
    },
  ],
  bench: {
    probe: (n) => sessionOf(n),
    persist: Option.some(() => returnSavedLate),
    stories: [
      benchTurn(() => trustDevice),
      benchStress(benchTurn(() => manyDevices)),
      benchPoint(() => longEmail, {
        series: "email-length",
        n: 100_000,
        unit: "chars",
        growth: "linear",
      }),
    ],
  },
});
