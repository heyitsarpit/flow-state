import { actorRef } from "../../src/index.ts";
import { PaletteMachine } from "./machines/palette.ts";
import { Option } from "effect";
import { benchSeries, manifest } from "../manifest.ts";
import { paletteApp, paletteSetup } from "./app.ts";
import { samples, seededStress, stories, stressSamples, listSavedOf } from "./stories/usual.ts";
import { emptyQueryOrder, typingUnderHeldStore } from "./stories/load.ts";
import { framesEight, twoPalettes } from "./stories/structure.ts";

/**
 * The command-palette fixture, as every runner reads it.
 */
export const commandPalette = manifest({
  name: "command-palette",
  setup: paletteSetup,
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
    probe: (n) => actorRef(PaletteMachine, `palette-${String(n)}`),
    persist: Option.some(() => seededStress),
    stories: benchSeries(
      {
        series: "list-length",
        unit: "commands",
        growth: "linear",
        sizes: [1000, 10_000, 100_000],
        stressFrom: Option.some(100_000),
      },
      listSavedOf,
    ),
  },
});
