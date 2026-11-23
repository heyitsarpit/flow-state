import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { documentApp, documentSetup, libraryOf } from "./app.ts";
import { documentSamples, documentStories } from "./stories/document.ts";
import { samples, savedEntry, seededStress, stories } from "./stories/usual.ts";

/**
 * The draft fixture, as every runner reads it.
 */
export const draft = manifest({
  name: "draft",
  setup: documentSetup,
  app: documentApp,
  stories: { ...stories, ...documentStories },
  samples: [samples, documentSamples],
  stressSamples: [samples, documentSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: samples }),
  pairs: [
    {
      samples: documentSamples,
      reach: {
        writes: true,
        persisted: true,
        cancelsAcknowledging: false,
        retainsUnknown: true,
        storesBeside: false,
      },
    },
  ],
  bench: {
    probe: (n) => libraryOf(n),
    persist: Option.some(() => savedEntry),
    stories: [],
  },
});
