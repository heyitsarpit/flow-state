import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { authGrown } from "./app.ts";
import { long, samples, seededStress, stories } from "./stories.ts";
import { emailAtBound, emptyCode, emptyEmail } from "./stories/edges.ts";
import { blankHandle, submitTwice, unconfirmedPrefill } from "./stories/findings.ts";
import { manyScreens, manySessions, reloadInLockout } from "./stories/load.ts";
import { samples as sessionSamples } from "./stories/samples.ts";
import {
  reloadedMidHandle,
  returnSavedLate,
  screenFirst,
  signOutForgets,
} from "./stories/structure.ts";
import { handleRetry } from "./stories/usual.ts";

/**
 * The sign-in fixture, as every runner reads it.
 */
export const signIn = manifest({
  name: "sign-in",
  app: authGrown,
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
    emailAtBound,
    emptyCode,
    reloadInLockout,
  },
  samples: [samples, sessionSamples],
  stressSamples: [samples, sessionSamples],
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
  ],
});
