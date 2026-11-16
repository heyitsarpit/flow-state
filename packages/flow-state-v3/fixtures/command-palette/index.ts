import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { paletteApp } from "./machine.ts";
import { samples, seededStress, stories, stressSamples } from "./stories.ts";
import { emptyQueryOrder, typingUnderHeldStore } from "./stories/load.ts";
import { framesEight, twoPalettes } from "./stories/structure.ts";

/**
 * The command-palette fixture, as every runner reads it.
 */
export const commandPalette = manifest({
  name: "command-palette",
  app: paletteApp,
  stories: { ...stories, framesEight, twoPalettes, emptyQueryOrder, typingUnderHeldStore },
  samples: [samples],
  stressSamples: [stressSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: stressSamples }),
  pairs: [
    {
      samples,
      reach: { writes: true, persisted: true, cancelsAcknowledging: false, retainsUnknown: true },
    },
  ],
});
