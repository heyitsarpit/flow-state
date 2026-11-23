import { Option } from "effect";
import { benchTurn, manifest } from "../manifest.ts";
import { wizardGrown, wizardGrownSetup } from "./app.ts";
import { manyBookings, quoteOf, seededStress } from "./stories/load.ts";
import { samples } from "./stories/samples.ts";
import { slotSamples, slotStories } from "./stories/slots.ts";
import { stories } from "./stories/usual.ts";

/**
 * The wizard fixture, as every runner reads it.
 */
export const wizard = manifest({
  name: "wizard",
  setup: wizardGrownSetup,
  app: wizardGrown,
  stories: { ...stories, ...slotStories, manyBookings, seededStress },
  samples: [samples, slotSamples],
  stressSamples: [samples, slotSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: samples }),
  pairs: [
    {
      samples,
      reach: {
        writes: false,
        persisted: true,
        cancelsAcknowledging: false,
        retainsUnknown: false,
        storesBeside: false,
      },
    },
    {
      samples: slotSamples,
      // The picker's writes are local, but the booking it tells saves its record while one is out.
      reach: {
        writes: true,
        persisted: false,
        cancelsAcknowledging: false,
        retainsUnknown: true,
        storesBeside: true,
      },
    },
  ],
  bench: {
    probe: (n) => quoteOf(n),
    persist: Option.some(() => stories.usual),
    stories: [benchTurn(() => stories.extendBurst)],
  },
});
