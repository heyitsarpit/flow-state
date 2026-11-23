import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { draftApp, draftSetup, libraryOf } from "./app.ts";
import { samples, savedEntry, seededStress, stories } from "./stories/usual.ts";

/**
 * The draft fixture, as every runner reads it.
 */
export const draft = manifest({
  name: "draft",
  setup: draftSetup,
  app: draftApp,
  stories: { ...stories },
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: samples }),
  pairs: [],
  bench: {
    probe: (n) => libraryOf(n),
    persist: Option.some(() => savedEntry),
    stories: [],
  },
});
