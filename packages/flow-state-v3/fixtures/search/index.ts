import { Option } from "effect";
import { benchTurn, manifest } from "../manifest.ts";
import { boxOf, searchApp, searchSetup } from "./app.ts";
import {
  seededStress,
  typeaheadSamples,
  typeaheadStories,
  typingBurst,
} from "./stories/typeahead.ts";

/**
 * The search fixture, as every runner reads it.
 */
export const search = manifest({
  name: "search",
  setup: searchSetup,
  app: searchApp,
  stories: { ...typeaheadStories },
  samples: [typeaheadSamples],
  stressSamples: [typeaheadSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: typeaheadSamples, stress: typeaheadSamples }),
  pairs: [
    {
      samples: typeaheadSamples,
      reach: {
        writes: false,
        persisted: false,
        cancelsAcknowledging: false,
        retainsUnknown: false,
      },
    },
  ],
  bench: {
    probe: (n) => boxOf(n),
    persist: Option.none(),
    stories: [benchTurn(() => typingBurst)],
  },
});
