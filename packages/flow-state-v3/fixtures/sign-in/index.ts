import { Option } from "effect";
import { benchPoint, benchStress, benchTurn, manifest } from "../manifest.ts";
import { authTrusted, authTrustedSetup, sessionOf } from "./app.ts";
import { long, samples, seededStress, stories, handleRetry, trustDevice } from "./stories/usual.ts";
import { deviceDateEdges, longEmail, emptyCode, emptyEmail } from "./stories/edges.ts";
import { blankHandle, submitTwice, unconfirmedPrefill } from "./stories/findings.ts";
import { manyDevices, manyScreens, manySessions, reloadInLockout } from "./stories/load.ts";
import { deviceSamples, samples as sessionSamples } from "./stories/samples.ts";
import {
  deviceChain,
  deviceFirst,
  deviceSessionForgotten,
  reloadedMidHandle,
  returnSavedLate,
  screenFirst,
  signOutForgets,
} from "./stories/structure.ts";

/**
 * The sign-in fixture, as every runner reads it.
 */
export const signIn = manifest({
  name: "sign-in",
  setup: authTrustedSetup,
  app: authTrusted,
  stories: {
    ...stories,
    returnSavedLate,
    reloadedMidHandle,
    handleRetry,
    blankHandle,
    submitTwice,
    unconfirmedPrefill,
    signOutForgets,
    screenFirst,
    manyScreens,
    manySessions,
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
  },
  samples: [samples, sessionSamples, deviceSamples],
  stressSamples: [samples, sessionSamples, deviceSamples],
  long: Option.some(long),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: false, cancelsAcknowledging: false, retainsUnknown: false },
    },
    {
      samples: sessionSamples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: false, retainsUnknown: true },
    },
    {
      samples: deviceSamples,
      reach: { writes: false, persisted: true, cancelsAcknowledging: false, retainsUnknown: false },
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
