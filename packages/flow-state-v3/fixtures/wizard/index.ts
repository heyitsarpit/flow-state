import { Option } from "effect";
import { benchTurn, manifest } from "../manifest.ts";
import { actorRef } from "../../src/index.ts";
import { wizardApp, wizardSetup } from "./app.ts";
import { BookingMachine } from "./machines/booking.ts";
import { seededStress } from "./stories/load.ts";
import { samples } from "./stories/samples.ts";
import { stories } from "./stories/usual.ts";

/**
 * The wizard fixture, as every runner reads it.
 */
export const wizard = manifest({
  name: "wizard",
  setup: wizardSetup,
  app: wizardApp,
  stories: { ...stories, seededStress },
  samples: [samples],
  stressSamples: [samples],
  long: Option.none(),
  savedStress: { story: seededStress, seed: 36 },
  // Out of the mix until the Turn I14 run rule judges a refused turn by its own actor: a refused
  // Held beside another app's queued write is misread as that turn's work (tests/rules/rules.test.ts).
  mix: Option.none(),
  pairs: [
    {
      samples,
      reach: { writes: false, persisted: true, cancelsAcknowledging: false, retainsUnknown: false },
    },
  ],
  bench: {
    probe: (n) => actorRef(BookingMachine, `quote-${String(n)}`),
    persist: Option.some(() => stories.usual),
    stories: [benchTurn(() => stories.extendBurst)],
  },
});
