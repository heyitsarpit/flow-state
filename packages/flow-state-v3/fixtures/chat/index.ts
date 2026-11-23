import { Option } from "effect";
import { benchTurn, manifest } from "../manifest.ts";
import { chatGrownApp, chatSetup, threadOf } from "./app.ts";
import { manyThreads, seededStress, sendBurst } from "./stories/load.ts";
import { attachmentSamples, samples } from "./stories/samples.ts";
import { uploadProgress, uploadStopped } from "./stories/attachments.ts";
import { stories, usual } from "./stories/usual.ts";

/**
 * The chat fixture, as every runner reads it.
 */
export const chat = manifest({
  name: "chat",
  setup: chatSetup,
  app: chatGrownApp,
  stories: { ...stories, sendBurst, manyThreads, seededStress, uploadProgress, uploadStopped },
  samples: [samples, attachmentSamples],
  stressSamples: [samples, attachmentSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: samples }),
  pairs: [
    {
      samples,
      reach: {
        writes: true,
        persisted: true,
        cancelsAcknowledging: true,
        retainsUnknown: true,
        storesBeside: false,
      },
    },
    {
      samples: attachmentSamples,
      reach: {
        writes: true,
        persisted: false,
        cancelsAcknowledging: false,
        retainsUnknown: true,
        storesBeside: false,
      },
    },
  ],
  bench: {
    probe: (n) => threadOf(n),
    persist: Option.some(() => usual),
    stories: [benchTurn(() => sendBurst), benchTurn(() => manyThreads)],
  },
});
