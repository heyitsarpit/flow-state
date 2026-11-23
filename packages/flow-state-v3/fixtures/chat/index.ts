import { Option } from "effect";
import { benchTurn, manifest } from "../manifest.ts";
import { chatApp, chatSetup, threadOf } from "./app.ts";
import { manyThreads, seededStress, sendBurst } from "./stories/load.ts";
import { samples } from "./stories/samples.ts";
import { stories, usual } from "./stories/usual.ts";

/**
 * The chat fixture, as every runner reads it.
 */
export const chat = manifest({
  name: "chat",
  setup: chatSetup,
  app: chatApp,
  stories: { ...stories, sendBurst, manyThreads, seededStress },
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: samples }),
  pairs: [],
  bench: {
    probe: (n) => threadOf(n),
    persist: Option.some(() => usual),
    stories: [benchTurn(() => sendBurst), benchTurn(() => manyThreads)],
  },
});
