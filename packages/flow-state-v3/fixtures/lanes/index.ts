import { actorRef } from "../../src/index.ts";
import { SerializeMachine } from "./machines/clients.ts";
import { Option } from "effect";
import { benchPoint, benchSeries, manifest } from "../manifest.ts";
import { lanesGrown, lanesGrownSetup } from "./app.ts";
import { recordSamples, samples, seededStress, stories, stressSamples } from "./stories/usual.ts";
import { negativeZero, twoSpellings } from "./stories/edges.ts";
import { crowd4, crowdOf, serializeDeepOf } from "./stories/load.ts";
import {
  answeredWhileDisposing,
  disposedWithWork,
  oneKeyTwoActors,
  reloadedWithWork,
} from "./stories/structure.ts";

/**
 * The lanes fixture, as every runner reads it.
 */
export const lanes = manifest({
  name: "lanes",
  setup: lanesGrownSetup,
  app: lanesGrown,
  stories: {
    ...stories,
    crowd4,
    oneKeyTwoActors,
    disposedWithWork,
    answeredWhileDisposing,
    reloadedWithWork,
    twoSpellings,
    negativeZero,
  },
  samples: [samples, recordSamples],
  stressSamples: [stressSamples, recordSamples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.some({ usual: samples, stress: stressSamples }),
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
  ],
  bench: {
    probe: (n) => actorRef(SerializeMachine, `serialize-${String(n)}`),
    persist: Option.some(() => seededStress),
    stories: [
      ...[16, 64, 256].map((n) =>
        benchPoint(() => crowdOf(n), { series: "actors", n, unit: "actors", growth: "flat" }),
      ),
      ...benchSeries(
        {
          series: "serialize-queue",
          unit: "queued",
          growth: "flat",
          sizes: [100, 1000, 3000],
          stressFrom: Option.some(3000),
        },
        serializeDeepOf,
      ),
    ],
  },
});
