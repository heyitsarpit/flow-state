import { actorRef } from "../../src/index.ts";
import { StepperMachine } from "./machines/stepper.ts";
import { Option } from "effect";
import { manifest } from "../manifest.ts";
import { numberApp, numberSetup } from "./app.ts";
import { samples, seededStress, stories } from "./stories/usual.ts";

/**
 * The number-input fixture, as every runner reads it.
 */
export const numberInput = manifest({
  name: "number-input",
  setup: numberSetup,
  app: numberApp,
  stories,
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  mix: Option.none(),
  pairs: [
    {
      samples,
      reach: {
        writes: false,
        persisted: false,
        cancelsAcknowledging: false,
        retainsUnknown: false,
        storesBeside: false,
      },
    },
  ],
  bench: {
    probe: (n) => actorRef(StepperMachine, `field-${String(n)}`),
    persist: Option.none(),
    stories: [],
  },
});
