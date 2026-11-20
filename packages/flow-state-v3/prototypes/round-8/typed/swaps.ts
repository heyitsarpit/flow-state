// main.ts --swap ../round-8/typed/swaps.ts: every scenario and search with the pinned Pay runs on the typed Pay; with the hand ThreeDS and Countdown, on the typed ones.
import { payFixture } from "../../conformance/fixtures/pay.compiled.ts";
import { payFullFixture } from "../../conformance/fixtures/pay-full.compiled.ts";
import type { Fixture } from "../../conformance/harness.ts";
import { typedPayFixture } from "./pay.typed.ts";
import { Countdown, ThreeDS } from "./threeds.typed.ts";

const typedFragments: Fixture = {
  ...payFullFixture,
  make: (api) => {
    const m = payFullFixture.make(api);
    return { ...m, fragments: { ...m.fragments, ThreeDS: ThreeDS.compiled, Countdown: Countdown.compiled } };
  },
};
export const swaps = new Map<Fixture, Fixture>([
  [payFixture, typedPayFixture],
  [payFullFixture, typedFragments],
]);
