import { Option } from "effect";
import { benchTurn, manifest } from "../manifest.ts";
import { boxOf } from "./app.ts";
import { searchResultsApp, searchResultsSetup } from "./results-app.ts";
import { resultsSamples, resultsStories } from "./stories/results.ts";
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
  setup: searchResultsSetup,
  app: searchResultsApp,
  stories: { ...typeaheadStories, ...resultsStories },
  samples: [typeaheadSamples, resultsSamples],
  stressSamples: [typeaheadSamples, resultsSamples],
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
        storesBeside: false,
      },
    },
    {
      samples: resultsSamples,
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
    probe: (n) => boxOf(n),
    persist: Option.none(),
    stories: [benchTurn(() => typingBurst)],
  },
});
